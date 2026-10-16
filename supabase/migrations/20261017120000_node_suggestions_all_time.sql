-- 行き先候補(v_node_suggestions)の並び順を「直近30日の使用回数 → 全期間の使用回数」にする。
-- 直近30日に記録がないと候補が0件になっていたため、全期間の回数で残りを埋め、
-- 常に上位8件が出るようにする(design_handoff_ui_refresh/01_bugfix.md §4)。
-- 全期間を対象にしたことで使わなくなったノードも上がってくるため、アーカイブ済み・
-- 削除済みのノードは候補から外す(DESIGN.md 2. nodes「is_archived は入力候補から隠す」)。
-- 列名と意味が変わる(usage_count は30日→全期間)ため、置き換えではなく作り直す。
drop view public.v_node_suggestions;

create view public.v_node_suggestions
with (security_invoker = true) as
select
  e.node_id,
  e.user_id,
  count(*) filter (where e.occurred_on >= (current_date - interval '30 days')) as recent_count,
  count(*) as usage_count
from (
  select to_node as node_id, user_id, occurred_on from public.v_lines
  union all
  select from_node as node_id, user_id, occurred_on from public.v_lines
) e
join public.nodes n on n.id = e.node_id
where not n.is_archived
  and n.deleted_at is null
group by e.node_id, e.user_id
order by recent_count desc, usage_count desc;
