-- 構成比ページ(apps/web の renderAnalysisPage)は listNodesWithPaths() の既定で
-- is_archived なノードを除外して root ノード候補を作るため、「親を持たない
-- (ルート)flow ノードをアーカイブすると、その取引は構成比の集計から消える」
-- という挙動になっている。v_monthly_flow はそれと無関係にすべての flow ノード
-- を合計していたため、dashboard の「今月の支出/収入」だけアーカイブ済みルート
-- ノードの金額を含み続けて構成比ページと数字が食い違っていた。
--
-- 葉ノード(親を持つノード)のアーカイブはこれまでどおり集計に影響しない
-- (記録は残る、v_cumulative は is_archived を見ない)。ここで除外するのは
-- 「親を持たない(ルート)ノードがアーカイブされた」場合のみで、構成比ページの
-- 挙動に厳密に揃えている。
create or replace view public.v_monthly_flow
with (security_invoker = true) as
select
  d.user_id,
  date_trunc('month', d.occurred_on)::date as month,
  sum(case when d.delta > 0 then d.delta else 0 end) as spend,
  sum(case when d.delta < 0 then -d.delta else 0 end) as income
from public.v_daily_deltas d
join public.nodes n on n.id = d.node_id
where n.node_type = 'flow'
  and not n.exclude_from_flow_totals
  and not (n.is_archived and n.parent_id is null)
group by d.user_id, date_trunc('month', d.occurred_on);
