-- v_monthly_flow classified each (node, day) delta independently ("プラスの
-- 日は支出、マイナスの日は収入"), summed across the whole month - a gross
-- total. 構成比ページ(renderAnalysisPage)は逆に、ルートflowノードごとに
-- 期間全体の増減を先にネットしてから、その1つの合計値の符号で支出/収入
-- どちらか一方に丸ごと計上する - 純額。
--
-- 同じノードが月内で両方向に動く場合(例: PayPayポイント運用益/付与が
-- ある日はポイント付与で増え、別の日は運用損や消費で減る)、この2つの
-- 集計方法は一致しない。dashboardの「今月の支出/収入」と構成比の
-- 「支出構成比/収入構成比」が食い違っていたのはこれが原因だった。
--
-- ここでは v_monthly_flow を構成比と同じ「ルートノード単位で期間(月)を
-- 先にネットしてから分類」方式に揃える。これにより、例えば運用損は
-- その月の運用益と相殺された上で収入側の減少として扱われ、支出には
-- 計上されなくなる(取引の記録方法やamountの符号は変更していない)。
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
