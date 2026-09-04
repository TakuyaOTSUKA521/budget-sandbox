import 'dotenv/config';
import { getAuthedClient } from '../../packages/core/client.js';
import { listLines } from '../../packages/core/reports.js';
import { importMemoKey } from '../../packages/core/crypto.js';

const { supabase } = await getAuthedClient();
const memoKey = await importMemoKey(process.env.MEMO_ENCRYPTION_KEY);

try {
    const lines = await listLines(supabase, { ascending: true }, memoKey);
    lines.forEach((l) => {
        console.log(
            `${l.occurred_on} | ${l.from_name.padEnd(10)} -> ${l.to_name.padEnd(10)} | ${String(l.amount).padStart(8)} | ${l.memo ?? ''}`
        );
    });
} catch (error) {
    console.error('ERROR', error.message);
}
