// Node CRUD, hierarchy operations, search and input suggestions.
// Table/column names (`nodes`, `parent_id`, `node_type`, ...) only appear here.

import { deleteLinesForNode } from './lines.js';

export async function createNode(supabase, { userId, name, parentId = null, nodeType, currency = 'JPY', excludeFromFlowTotals = false }) {
    const { data, error } = await supabase
        .from('nodes')
        .insert({ user_id: userId, name, parent_id: parentId, node_type: nodeType, currency, exclude_from_flow_totals: excludeFromFlowTotals })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Renames and/or reparents a node. `nodeType` isn't editable here - changing
// it interacts with the parent/children node_type triggers in ways too easy
// to get wrong from a simple form, so a type change stays a DB-side-only move.
export async function updateNode(supabase, nodeId, { name, parentId, excludeFromFlowTotals } = {}) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (parentId !== undefined) patch.parent_id = parentId;
    if (excludeFromFlowTotals !== undefined) patch.exclude_from_flow_totals = excludeFromFlowTotals;

    const { data, error } = await supabase
        .from('nodes')
        .update(patch)
        .eq('id', nodeId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function listNodes(supabase, { includeArchived = false } = {}) {
    let query = supabase.from('nodes').select('*').order('name');
    if (!includeArchived) query = query.eq('is_archived', false);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function archiveNode(supabase, nodeId) {
    const { data, error } = await supabase
        .from('nodes')
        .update({ is_archived: true })
        .eq('id', nodeId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function unarchiveNode(supabase, nodeId) {
    const { data, error } = await supabase
        .from('nodes')
        .update({ is_archived: false })
        .eq('id', nodeId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function hasChildren(supabase, nodeId) {
    const { count, error } = await supabase
        .from('nodes')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', nodeId);

    if (error) throw error;
    return (count ?? 0) > 0;
}

async function removeNode(supabase, nodeId) {
    const { error } = await supabase.from('nodes').delete().eq('id', nodeId);
    if (error) throw error;
}

// Deletes a node: first supersedes every line touching it (never a physical
// line delete - see lines.js), then removes the node row itself.
//
// A node that was ever used in a transaction still has a row in `lines`
// after superseding (only `superseded_at` changed), and `lines.from_node` /
// `to_node` are `on delete restrict` - so the DB will refuse to physically
// remove it. In that case we fall back to archiving: same result for the
// user (gone from every list/picker/suggestion), full history preserved.
export async function deleteNode(supabase, nodeId) {
    if (await hasChildren(supabase, nodeId)) {
        throw new Error('子ノードがあるため削除できません。先に子ノードを削除するか、移動してください。');
    }

    await deleteLinesForNode(supabase, nodeId);

    try {
        await removeNode(supabase, nodeId);
        return { removed: true, archived: false };
    } catch (error) {
        if (error.code !== '23503') throw error; // not a foreign-key-restrict failure
        await archiveNode(supabase, nodeId);
        return { removed: false, archived: true };
    }
}

// Leaf nodes (no children) are the only valid `lines` endpoints; used to build
// input pickers without making callers walk the hierarchy themselves.
export async function getLeafNodes(supabase, { nodeType } = {}) {
    const nodes = await listNodes(supabase);
    const parentIds = new Set(nodes.map((n) => n.parent_id).filter(Boolean));
    return nodes.filter((n) => !parentIds.has(n.id) && (!nodeType || n.node_type === nodeType));
}

// Displayable "食費 > 外食 > マクドナルド" path for every node.
export async function getNodePaths(supabase) {
    const { data, error } = await supabase.from('v_node_paths').select('*');
    if (error) throw error;
    return data;
}

// All (non-archived) nodes with their display path attached; used for
// hierarchy-aware pickers such as a "parent node" selector.
export async function listNodesWithPaths(supabase, { includeArchived = false } = {}) {
    const [nodes, paths] = await Promise.all([listNodes(supabase, { includeArchived }), getNodePaths(supabase)]);
    const pathByNodeId = new Map(paths.map((p) => [p.node_id, p.path]));
    return nodes.map((n) => ({ ...n, path: pathByNodeId.get(n.id) ?? n.name }));
}

export async function searchNodes(supabase, query) {
    const [{ data: nodes, error: nodesError }, paths] = await Promise.all([
        supabase.from('nodes').select('*').eq('is_archived', false).ilike('name', `%${query}%`),
        getNodePaths(supabase)
    ]);
    if (nodesError) throw nodesError;

    const pathByNodeId = new Map(paths.map((p) => [p.node_id, p.path]));
    return nodes.map((n) => ({ ...n, path: pathByNodeId.get(n.id) ?? n.name }));
}

// Top-used leaf nodes over the last 30 days, for input suggestion buttons.
export async function getNodeSuggestions(supabase, limit = 8) {
    const [{ data: suggestions, error: suggestionsError }, paths] = await Promise.all([
        supabase.from('v_node_suggestions').select('*').limit(limit),
        getNodePaths(supabase)
    ]);
    if (suggestionsError) throw suggestionsError;

    const pathByNodeId = new Map(paths.map((p) => [p.node_id, p.path]));
    return suggestions.map((s) => ({ ...s, path: pathByNodeId.get(s.node_id) ?? null }));
}

// `nodeId` plus every node beneath it (v_node_tree's depth-0 row covers
// `nodeId` itself), for rolling up a parent node's transactions/history.
export async function getDescendantIds(supabase, nodeId) {
    const { data, error } = await supabase.from('v_node_tree').select('descendant_id').eq('ancestor_id', nodeId);
    if (error) throw error;
    return data.map((row) => row.descendant_id);
}

// Turns a recorded leaf into an intermediate node: creates "その他(name)" and
// reassigns its existing lines to it, atomically (see promote_to_parent() in
// supabase/migrations). Required before adding any other child to `nodeId`.
export async function promoteToParent(supabase, nodeId) {
    const { data, error } = await supabase.rpc('promote_to_parent', { target_node_id: nodeId });
    if (error) throw error;
    return data;
}
