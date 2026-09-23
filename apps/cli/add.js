import 'dotenv/config';
import { getAuthedClient } from '../../packages/core/client.js';
import { recordLine } from '../../packages/core/lines.js';
import { importMemoKey } from '../../packages/core/crypto.js';

const { supabase, user } = await getAuthedClient();
const memoKey = await importMemoKey(process.env.MEMO_ENCRYPTION_KEY);

// --exclude-from-flow: 収支の集計・構成比から除外する(残高には含まれる)
const args = process.argv.slice(2);
const excludeFromFlowTotals = args.includes('--exclude-from-flow');
const [fromNode, toNode, amount, ...memoParts] = args.filter((a) => a !== '--exclude-from-flow');
if (!fromNode || !toNode || !amount) {
    console.error('使い方: node apps/cli/add.js [--exclude-from-flow] <fromNodeId> <toNodeId> <amount> [memo...]');
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
        memo,
        excludeFromFlowTotals
    }, memoKey);
    console.log('REGISTERED', line);
} catch (error) {
    console.error('ERROR', error.message);
}
