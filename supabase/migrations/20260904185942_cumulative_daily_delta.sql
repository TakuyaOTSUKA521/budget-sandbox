-- Add the per-day (non-cumulative) rollup delta alongside the running
-- cumulative_balance, so the node detail chart can toggle between "累積推移"
-- and "一日あたり推移" from a single query. Appended as a trailing column so
-- existing selects of v_cumulative are unaffected.
create or replace view public.v_cumulative
with (security_invoker = true) as
with daily as (
  select t.ancestor_id as node_id, t.user_id, d.occurred_on, sum(d.delta) as daily_delta
  from public.v_node_tree t
  join public.v_daily_deltas d on d.node_id = t.descendant_id
  group by t.ancestor_id, t.user_id, d.occurred_on
)
select
  node_id,
  user_id,
  occurred_on,
  sum(daily_delta) over (partition by node_id order by occurred_on) as cumulative_balance,
  daily_delta
from daily;
