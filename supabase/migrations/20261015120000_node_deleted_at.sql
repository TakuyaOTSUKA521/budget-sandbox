-- ノードの「削除済み」の印(DESIGN.md 2. nodes「ノードの削除」)。
-- 取引は物理削除しないため、取引に使われたノードは lines の on delete restrict で
-- 行を消せない。削除時は関わる取引を無効化したうえでこの列を埋め、
-- アーカイブ一覧も含めてどこにも出さない。
alter table public.nodes
  add column deleted_at timestamptz;
