-- 取引単位の「集計から除外」(DESIGN.md 4. 仕訳パターン「集計から除外する取引」)。
-- クレカ・銀行の明細と1行ずつ突き合わせたいが自分の収支ではない取引(他人の代わりに
-- 払っただけ等)を、残高はそのままに収支の集計・構成比解析からだけ外す。
-- ノード単位の nodes.exclude_from_flow_totals と同じ考え方を取引1行に下ろしたもので、
-- 両者は OR の関係になる。
alter table public.lines
  add column exclude_from_flow_totals boolean not null default false;

-- 両端が asset/liability の取引はもともと収支に入らないので、フラグは意味を持たない。
-- 立っていても何も起きないのは誤解のもとなので拒否する(DESIGN.md 設計原則6)。
create or replace function public.lines_validate_flow_exclusion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.exclude_from_flow_totals and not exists (
    select 1
    from public.nodes n
    where n.id in (new.from_node, new.to_node)
      and n.node_type = 'flow'
  ) then
    raise exception 'exclude_from_flow_totals requires at least one flow endpoint (a transfer between asset/liability nodes is never counted in flow totals)';
  end if;
  return new;
end;
$$;

create trigger lines_validate_flow_exclusion_trigger
before insert or update of exclude_from_flow_totals, from_node, to_node on public.lines
for each row execute function public.lines_validate_flow_exclusion();

-- Views: columns are only appended (create or replace view can't reorder or
-- drop them), so every existing select keeps working unchanged.

create or replace view public.v_lines
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
  l.superseded_at,
  l.exclude_from_flow_totals
from public.lines l
join public.nodes fn on fn.id = l.from_node
join public.nodes tn on tn.id = l.to_node
where l.superseded_at is null;

-- counts_in_flow_totals: 収支の集計に入れてよい増減か。残高系のビューはこの列を
-- 見ずに delta を全部足す(除外しても残高は明細どおり動く)。
create or replace view public.v_daily_deltas
with (security_invoker = true) as
select to_node as node_id, occurred_on, amount as delta, user_id, not exclude_from_flow_totals as counts_in_flow_totals
from public.v_lines
union all
select from_node as node_id, occurred_on, -amount as delta, user_id, not exclude_from_flow_totals as counts_in_flow_totals
from public.v_lines;

-- flow_daily_delta: daily_delta から除外された取引を除いたもの(子孫込み)。
-- 構成比の収支など、期間の収支を出す画面はこちらを合計する。
create or replace view public.v_cumulative
with (security_invoker = true) as
with daily as (
  select
    t.ancestor_id as node_id,
    t.user_id,
    d.occurred_on,
    sum(d.delta) as daily_delta,
    sum(case when d.counts_in_flow_totals then d.delta else 0 end) as flow_daily_delta
  from public.v_node_tree t
  join public.v_daily_deltas d on d.node_id = t.descendant_id
  group by t.ancestor_id, t.user_id, d.occurred_on
)
select
  node_id,
  user_id,
  occurred_on,
  sum(daily_delta) over (partition by node_id order by occurred_on) as cumulative_balance,
  daily_delta,
  flow_daily_delta
from daily;

-- Same as 20260919143000_net_per_root_monthly_flow.sql, plus dropping
-- excluded lines before netting each root node's month.
create or replace view public.v_monthly_flow
with (security_invoker = true) as
with node_month as (
  select
    t.ancestor_id as node_id,
    t.user_id,
    date_trunc('month', d.occurred_on)::date as month,
    sum(d.delta) as net_delta
  from public.v_node_tree t
  join public.v_daily_deltas d on d.node_id = t.descendant_id
  where d.counts_in_flow_totals
  group by t.ancestor_id, t.user_id, date_trunc('month', d.occurred_on)
)
select
  nm.user_id,
  nm.month,
  sum(case when nm.net_delta > 0 then nm.net_delta else 0 end) as spend,
  sum(case when nm.net_delta < 0 then -nm.net_delta else 0 end) as income
from node_month nm
join public.nodes n on n.id = nm.node_id
where n.node_type = 'flow'
  and n.parent_id is null
  and not n.is_archived
  and not n.exclude_from_flow_totals
group by nm.user_id, nm.month;
