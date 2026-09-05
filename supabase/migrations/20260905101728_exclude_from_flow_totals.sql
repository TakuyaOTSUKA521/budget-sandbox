-- Opening-balance / one-off seed nodes (see DESIGN.md 仕訳パターン「初期残高」)
-- can be flagged so their lines don't inflate 収入/支出 flow analysis.
-- Net worth is unaffected: the asset/liability side of the line still
-- counts normally, only the flow-side attribution is excluded.
alter table public.nodes
  add column exclude_from_flow_totals boolean not null default false;

create or replace view public.v_monthly_flow
with (security_invoker = true) as
select
  d.user_id,
  date_trunc('month', d.occurred_on)::date as month,
  sum(case when d.delta > 0 then d.delta else 0 end) as spend,
  sum(case when d.delta < 0 then -d.delta else 0 end) as income
from public.v_daily_deltas d
join public.nodes n on n.id = d.node_id
where n.node_type = 'flow' and not n.exclude_from_flow_totals
group by d.user_id, date_trunc('month', d.occurred_on);
