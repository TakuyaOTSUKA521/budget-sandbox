// All aggregation lives in the database views; this file only selects from
// them. No JOIN/GROUP BY here (see CLAUDE.md "禁止事項").

import { decryptMemo } from './crypto.js';

async function withDecryptedMemo(rows, memoKey) {
    return Promise.all(rows.map(async (row) => ({ ...row, memo: await decryptMemo(memoKey, row.memo) })));
}

export async function listLines(supabase, { ascending = true, limit, offset = 0 } = {}, memoKey) {
    let query = supabase.from('v_lines').select('*').order('occurred_on', { ascending }).order('recorded_at', { ascending });
    if (limit) query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;
    return withDecryptedMemo(data, memoKey);
}

export async function getDailyDeltas(supabase, { from, to } = {}) {
    let query = supabase.from('v_daily_deltas').select('*');
    if (from) query = query.gte('occurred_on', from);
    if (to) query = query.lte('occurred_on', to);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getNodeBalances(supabase) {
    const { data, error } = await supabase.from('v_node_balances').select('*');
    if (error) throw error;
    return data;
}

export async function getRollupBalances(supabase) {
    const { data, error } = await supabase.from('v_rollup_balances').select('*');
    if (error) throw error;
    return data;
}

// `nodeIds` should be a node plus all of its descendants (see
// nodes.js#getDescendantIds) so an intermediate node's detail view shows its
// children's transactions too, not just lines that reference it directly.
export async function getLinesForNodes(supabase, nodeIds, memoKey) {
    if (nodeIds.length === 0) return [];

    const filter = nodeIds.map((id) => `from_node.eq.${id},to_node.eq.${id}`).join(',');
    const { data, error } = await supabase
        .from('v_lines')
        .select('*')
        .or(filter)
        .order('occurred_on', { ascending: false });

    if (error) throw error;
    return withDecryptedMemo(data, memoKey);
}

export async function getCumulative(supabase, nodeId) {
    const { data, error } = await supabase
        .from('v_cumulative')
        .select('*')
        .eq('node_id', nodeId)
        .order('occurred_on', { ascending: true });

    if (error) throw error;
    return data;
}

// Same view as getCumulative, but for several nodes and an optional date
// range at once - used to build a period's per-node totals (composition
// ratio breakdowns) without writing a GROUP BY in the caller: each node's
// `daily_delta` already includes its descendants (see v_cumulative), so the
// caller only has to sum `daily_delta` per node_id across the returned rows.
export async function getCumulativeForNodes(supabase, nodeIds, { from, to } = {}) {
    if (nodeIds.length === 0) return [];

    let query = supabase.from('v_cumulative').select('*').in('node_id', nodeIds);
    if (from) query = query.gte('occurred_on', from);
    if (to) query = query.lte('occurred_on', to);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getNetWorth(supabase) {
    const { data, error } = await supabase.from('v_net_worth').select('*').maybeSingle();
    if (error) throw error;
    return data ?? { net_worth: 0 };
}

export async function getNetWorthDaily(supabase) {
    const { data, error } = await supabase.from('v_net_worth_daily').select('*').order('occurred_on', { ascending: true });
    if (error) throw error;
    return data;
}

export async function getMonthlyFlow(supabase, month) {
    const { data, error } = await supabase.from('v_monthly_flow').select('*').eq('month', month).maybeSingle();
    if (error) throw error;
    return data ?? { spend: 0, income: 0 };
}
