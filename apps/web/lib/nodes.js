import { listNodesWithPaths } from '../packages/core/nodes.js';
import { supabase } from './supabase.js';
import { setNodesById } from '../state.js';

export const NODE_TYPE_META = {
  asset: { label: '資産', color: 'var(--accent)' },
  liability: { label: '負債', color: 'var(--negative)' },
  flow: { label: '収支', color: 'var(--secondary)' }
};

// ============================================================
// Shared node-hierarchy helpers (mirrors nodes.js#getLeafNodes but keeps
// path/depth info the UI needs; still just filtering already-fetched rows).
// ============================================================

export async function loadAllNodesWithPaths() {
  const nodes = await listNodesWithPaths(supabase);
  setNodesById(new Map(nodes.map((n) => [n.id, n])));
  return nodes;
}

export function computeSpendingDestinations(nodes, balanceByNodeId) {
  const parentIds = new Set(nodes.map((n) => n.parent_id).filter(Boolean));
  return nodes
    .filter((n) => n.node_type === 'flow' && !parentIds.has(n.id))
    .filter((n) => Number(balanceByNodeId.get(n.id) ?? 0) > 0)
    .sort((a, b) => Number(balanceByNodeId.get(b.id)) - Number(balanceByNodeId.get(a.id)));
}
