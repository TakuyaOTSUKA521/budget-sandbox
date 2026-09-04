import 'dotenv/config';
import { getAuthedClient } from '../../packages/core/client.js';
import { recordLine } from '../../packages/core/lines.js';
import { importMemoKey } from '../../packages/core/crypto.js';

const { supabase, user } = await getAuthedClient();
const memoKey = await importMemoKey(process.env.MEMO_ENCRYPTION_KEY);

const [fromNode, toNode, amount, ...memoParts] = process.argv.slice(2);
if (!fromNode || !toNode || !amount) {
    console.error('使い方: node apps/cli/add.js <fromNodeId> <toNodeId> <amount> [memo...]');
    process.exit(1);
}

const memo = memoParts.join(' ');
const occurredOn = new Date().toISOString().slice(0, 10);

try {
    const line = await recordLine(supabase, {
        userId: user.id,
        occurredOn,
        fromNode,
        toNode,
        amount: Number(amount),
        memo
    }, memoKey);
    console.log('REGISTERED', line);
} catch (error) {
    console.error('ERROR', error.message);
}
