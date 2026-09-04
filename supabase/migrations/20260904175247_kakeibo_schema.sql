-- kakeibo schema: nodes / lines / labels / line_labels / valuations
-- Replaces the demo schema (transaction / accounts / categories). No data migration
-- (see DESIGN.md #6): the old tables only ever held demo data.

create extension if not exists "pgcrypto";

drop table if exists public.transaction cascade;
drop table if exists public.accounts cascade;
drop table if exists public.categories cascade;

-- ============================================================
-- Tables
-- ============================================================

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.nodes(id) on delete restrict,
  node_type text not null check (node_type in ('asset', 'liability', 'flow')),
  currency text not null default 'JPY',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index nodes_user_id_idx on public.nodes(user_id);
create index nodes_parent_id_idx on public.nodes(parent_id);

create table public.lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_on date not null,
  from_node uuid not null references public.nodes(id) on delete restrict,
  to_node uuid not null references public.nodes(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  memo text,
  recorded_at timestamptz not null default now(),
  version_of uuid references public.lines(id) on delete set null,
  superseded_at timestamptz,
  check (from_node <> to_node)
);

create index lines_user_id_idx on public.lines(user_id);
create index lines_from_node_idx on public.lines(from_node);
create index lines_to_node_idx on public.lines(to_node);
create index lines_active_idx on public.lines(user_id) where superseded_at is null;

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null
);

create table public.line_labels (
  line_id uuid not null references public.lines(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (line_id, label_id)
);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  valued_on date not null,
  market_value numeric(14, 2) not null,
  recorded_at timestamptz not null default now()
);

create index valuations_node_id_idx on public.valuations(node_id);

-- ============================================================
-- Triggers: nodes hierarchy integrity
-- ============================================================

-- Same node_type as parent, same user_id as parent, no cycles.
create or replace function public.nodes_validate_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent_record public.nodes%rowtype;
  ancestor_id uuid;
begin
  if new.parent_id is not null then
    select * into parent_record from public.nodes where id = new.parent_id;

    if not found then
      raise exception 'parent_id % does not exist', new.parent_id;
    end if;

    if parent_record.user_id <> new.user_id then
      raise exception 'parent_id must belong to the same user';
    end if;

    if parent_record.node_type <> new.node_type then
      raise exception 'node_type must match parent node_type (%)', parent_record.node_type;
    end if;

    ancestor_id := new.parent_id;
    while ancestor_id is not null loop
      if ancestor_id = new.id then
        raise exception 'circular parent_id reference detected';
      end if;
      select parent_id into ancestor_id from public.nodes where id = ancestor_id;
    end loop;
  end if;

  return new;
end;
$$;

create trigger nodes_validate_hierarchy_trigger
before insert or update of parent_id, node_type, user_id on public.nodes
for each row execute function public.nodes_validate_hierarchy();

-- A node's node_type cannot change away from what its existing children already have.
create or replace function public.nodes_validate_children_type()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.nodes c
    where c.parent_id = new.id and c.node_type <> new.node_type
  ) then
    raise exception 'cannot change node_type: existing children have a different node_type';
  end if;
  return new;
end;
$$;

create trigger nodes_validate_children_type_trigger
before update of node_type on public.nodes
for each row execute function public.nodes_validate_children_type();

-- ============================================================
-- Deferred constraint: lines must reference leaf nodes only
-- ============================================================
-- Deferred to transaction commit so promote_to_parent() can, in one transaction,
-- add a child under a currently-recorded node and move its lines away from it
-- without tripping this check mid-transaction (DESIGN.md "中間ノード化の扱い").
create or replace function public.check_leaf_invariant()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.lines l
    where l.superseded_at is null
      and (
        exists (select 1 from public.nodes c where c.parent_id = l.from_node)
        or exists (select 1 from public.nodes c where c.parent_id = l.to_node)
      )
  ) then
    raise exception 'lines must reference leaf nodes only (a referenced node has children); use promote_to_parent() to reassign existing lines first';
  end if;
  return null;
end;
$$;

create constraint trigger lines_leaf_invariant_trigger
after insert or update on public.lines
deferrable initially deferred
for each row execute function public.check_leaf_invariant();

create constraint trigger nodes_leaf_invariant_trigger
after insert or update on public.nodes
deferrable initially deferred
for each row execute function public.check_leaf_invariant();

-- ============================================================
-- promote_to_parent: turn a recorded leaf into an intermediate node
-- ============================================================
create or replace function public.promote_to_parent(target_node_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_leaf_id uuid;
  target_node public.nodes%rowtype;
begin
  select * into target_node from public.nodes where id = target_node_id;

  if not found then
    raise exception 'node % not found', target_node_id;
  end if;

  if target_node.user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  insert into public.nodes (user_id, name, parent_id, node_type, currency)
  values (
    target_node.user_id,
    'その他(' || target_node.name || ')',
    target_node.id,
    target_node.node_type,
    target_node.currency
  )
  returning id into new_leaf_id;

  update public.lines
  set from_node = new_leaf_id
  where from_node = target_node_id and superseded_at is null;

  update public.lines
  set to_node = new_leaf_id
  where to_node = target_node_id and superseded_at is null;

  return new_leaf_id;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.nodes enable row level security;
alter table public.lines enable row level security;
alter table public.labels enable row level security;
alter table public.line_labels enable row level security;
alter table public.valuations enable row level security;

create policy nodes_select on public.nodes for select using (auth.uid() = user_id);
create policy nodes_insert on public.nodes for insert with check (auth.uid() = user_id);
create policy nodes_update on public.nodes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy nodes_delete on public.nodes for delete using (auth.uid() = user_id);

create policy lines_select on public.lines for select using (auth.uid() = user_id);
create policy lines_insert on public.lines for insert with check (auth.uid() = user_id);
create policy lines_update on public.lines for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy lines_delete on public.lines for delete using (auth.uid() = user_id);

create policy labels_select on public.labels for select using (auth.uid() = user_id);
create policy labels_insert on public.labels for insert with check (auth.uid() = user_id);
create policy labels_update on public.labels for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy labels_delete on public.labels for delete using (auth.uid() = user_id);

create policy valuations_select on public.valuations for select using (auth.uid() = user_id);
create policy valuations_insert on public.valuations for insert with check (auth.uid() = user_id);
create policy valuations_update on public.valuations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy valuations_delete on public.valuations for delete using (auth.uid() = user_id);

-- line_labels has no user_id column; ownership is checked through the parent lines/labels rows.
create policy line_labels_select on public.line_labels for select
  using (exists (select 1 from public.lines l where l.id = line_id and l.user_id = auth.uid()));

create policy line_labels_insert on public.line_labels for insert
  with check (
    exists (select 1 from public.lines l where l.id = line_id and l.user_id = auth.uid())
    and exists (select 1 from public.labels lb where lb.id = label_id and lb.user_id = auth.uid())
  );

create policy line_labels_update on public.line_labels for update
  using (exists (select 1 from public.lines l where l.id = line_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.lines l where l.id = line_id and l.user_id = auth.uid()));

create policy line_labels_delete on public.line_labels for delete
  using (exists (select 1 from public.lines l where l.id = line_id and l.user_id = auth.uid()));

-- ============================================================
-- Views (all security_invoker so RLS is evaluated as the calling user)
-- ============================================================

create view public.v_lines
with (security_invoker = true) as
select
  l.id,
  l.user_id,
  l.occurred_on,
  l.from_node,
  fn.name as from_name,
  l.to_node,
  tn.name as to_name,
  l.amount,
  l.memo,
  l.recorded_at,
  l.version_of,
  l.superseded_at
from public.lines l
join public.nodes fn on fn.id = l.from_node
join public.nodes tn on tn.id = l.to_node
where l.superseded_at is null;

-- (ancestor_id, descendant_id) for every pair, including depth 0 (self).
create view public.v_node_tree
with (security_invoker = true) as
with recursive tree as (
  select id as ancestor_id, id as descendant_id, 0 as depth, user_id
  from public.nodes
  union all
  select t.ancestor_id, n.id, t.depth + 1, n.user_id
  from public.nodes n
  join tree t on n.parent_id = t.descendant_id
)
select * from tree;

-- Sign convention lives here only: to_node is +amount, from_node is -amount.
create view public.v_daily_deltas
with (security_invoker = true) as
select to_node as node_id, occurred_on, amount as delta, user_id
from public.v_lines
union all
select from_node as node_id, occurred_on, -amount as delta, user_id
from public.v_lines;

create view public.v_node_balances
with (security_invoker = true) as
select node_id, user_id, sum(delta) as balance
from public.v_daily_deltas
group by node_id, user_id;

create view public.v_rollup_balances
with (security_invoker = true) as
select t.ancestor_id as node_id, sum(d.delta) as balance
from public.v_node_tree t
join public.v_daily_deltas d on d.node_id = t.descendant_id
group by t.ancestor_id;

create view public.v_cumulative
with (security_invoker = true) as
with daily as (
  select node_id, user_id, occurred_on, sum(delta) as daily_delta
  from public.v_daily_deltas
  group by node_id, user_id, occurred_on
)
select
  node_id,
  user_id,
  occurred_on,
  sum(daily_delta) over (partition by node_id order by occurred_on) as cumulative_balance
from daily;

create view public.v_net_worth
with (security_invoker = true) as
select b.user_id, sum(b.balance) as net_worth
from public.v_node_balances b
join public.nodes n on n.id = b.node_id
where n.node_type in ('asset', 'liability')
group by b.user_id;

create view public.v_node_suggestions
with (security_invoker = true) as
select node_id, user_id, count(*) as usage_count
from (
  select to_node as node_id, user_id, occurred_on from public.v_lines
  union all
  select from_node as node_id, user_id, occurred_on from public.v_lines
) endpoints
where occurred_on >= (current_date - interval '30 days')
group by node_id, user_id
order by usage_count desc;

create view public.v_node_paths
with (security_invoker = true) as
select
  t.descendant_id as node_id,
  string_agg(n.name, ' > ' order by t.depth desc) as path
from public.v_node_tree t
join public.nodes n on n.id = t.ancestor_id
group by t.descendant_id;
