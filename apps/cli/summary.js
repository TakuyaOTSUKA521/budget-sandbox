import 'dotenv/config';
import { getAuthedClient } from '../../packages/core/client.js';
import { getRollupBalances } from '../../packages/core/reports.js';
import { getNodePaths } from '../../packages/core/nodes.js';

const { supabase } = await getAuthedClient();

try {
    const [balances, paths] = await Promise.all([getRollupBalances(supabase), getNodePaths(supabase)]);
    const pathByNodeId = new Map(paths.map((p) => [p.node_id, p.path]));

    balances
        .filter((b) => Number(b.balance) !== 0)
        .sort((a, b) => Number(a.balance) - Number(b.balance))
        .forEach((b) => {
            console.log(`${(pathByNodeId.get(b.node_id) ?? b.node_id).padEnd(30)} : ${b.balance}`);
        });
} catch (error) {
    console.error('ERROR', error.message);
}
