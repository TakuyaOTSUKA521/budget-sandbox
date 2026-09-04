-- Aggregates for the Web dashboard page.

-- Net worth's daily running total (asset/liability only), for the dashboard
-- trend chart. Same pattern as v_cumulative, but summed across all
-- asset/liability nodes instead of partitioned by a single node_id.
create view public.v_net_worth_daily
with (security_invoker = true) as
with daily as (
  select d.user_id, d.occurred_on, sum(d.delta) as daily_delta
  from public.v_daily_deltas d
  join public.nodes n on n.id = d.node_id
  where n.node_type in ('asset', 'liability')
  group by d.user_id, d.occurred_on
)
select
  user_id,
  occurred_on,
  sum(daily_delta) over (partition by user_id order by occurred_on) as net_worth
from daily;

-- Per-month spend/income totals (flow nodes only), for the dashboard's
-- "今月の支出" / "今月の収入" stat cards.
create view public.v_monthly_flow
with (security_invoker = true) as
select
  d.user_id,
  date_trunc('month', d.occurred_on)::date as month,
  sum(case when d.delta > 0 then d.delta else 0 end) as spend,
  sum(case when d.delta < 0 then -d.delta else 0 end) as income
from public.v_daily_deltas d
join public.nodes n on n.id = d.node_id
where n.node_type = 'flow'
group by d.user_id, date_trunc('month', d.occurred_on);
