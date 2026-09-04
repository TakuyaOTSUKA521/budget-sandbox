-- v_cumulative previously summed only a node's own deltas, so an intermediate
-- node (one with children) always came back empty for the node detail screen's
-- balance chart. Same rollup rule as v_rollup_balances applies here
-- (DESIGN.md "中間ノードの数値は子孫の合計として計算する"): replace it with a
-- version that includes descendants. For a leaf node this is unchanged,
-- since v_node_tree's only row for a leaf is its own depth-0 row.
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
  sum(daily_delta) over (partition by node_id order by occurred_on) as cumulative_balance
from daily;
