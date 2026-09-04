// Line (transaction) registration, revision and deletion.
// Lines are never physically deleted or overwritten: revise/delete both work
// by setting `superseded_at` on the old row (see DESIGN.md "バージョニング").
//
// `memo` is stored encrypted (see crypto.js) so it doesn't show up as plain
// text in the Supabase dashboard, which connects with a role that bypasses
// RLS. Every caller must pass the imported memo key.

import { encryptMemo } from './crypto.js';

export async function recordLine(supabase, { userId, occurredOn, fromNode, toNode, amount, memo = null }, memoKey) {
    const { data, error } = await supabase
        .from('lines')
        .insert({
            user_id: userId,
            occurred_on: occurredOn,
            from_node: fromNode,
            to_node: toNode,
            amount,
            memo: await encryptMemo(memoKey, memo)
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteLine(supabase, lineId) {
    const { data, error } = await supabase
        .from('lines')
        .update({ superseded_at: new Date().toISOString() })
        .eq('id', lineId)
        .is('superseded_at', null)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Supersedes `lineId` and inserts a new line with the given fields merged
// over the original, linked back via `version_of`. `patch.memo` (if given)
// is plaintext and gets encrypted; leaving it out keeps the original's
// already-encrypted memo untouched.
export async function reviseLine(supabase, lineId, patch, memoKey) {
    const { data: original, error: fetchError } = await supabase
        .from('lines')
        .select('*')
        .eq('id', lineId)
        .single();
    if (fetchError) throw fetchError;

    const superseded = await deleteLine(supabase, lineId);

    const memo = patch.memo !== undefined ? await encryptMemo(memoKey, patch.memo) : original.memo;

    const { data: revised, error: insertError } = await supabase
        .from('lines')
        .insert({
            user_id: original.user_id,
            occurred_on: patch.occurredOn ?? original.occurred_on,
            from_node: patch.fromNode ?? original.from_node,
            to_node: patch.toNode ?? original.to_node,
            amount: patch.amount ?? original.amount,
            memo,
            version_of: superseded.id
        })
        .select()
        .single();
    if (insertError) throw insertError;

    return revised;
}
