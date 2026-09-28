import { createSupabaseClient } from '../packages/core/client.js';
import { importMemoKey } from '../packages/core/crypto.js';

export const supabase = createSupabaseClient(
  'https://sicucuywqqcapbogfkoy.supabase.co',
  'sb_publishable_oInvR1n1J0y_ereuoDT6pw_odcKt4ya'
);

// Same key as .env's MEMO_ENCRYPTION_KEY. Not a secret from anyone reading
// this page's source (no server to hide it behind) - it only keeps memo out
// of the Supabase dashboard, which connects with a role that bypasses RLS.
export const memoKey = await importMemoKey('obUs/GKDLfSYucBlOHMOfVin3+iyEDk57/BS/T6Aoqs=');
