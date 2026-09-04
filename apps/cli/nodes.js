import 'dotenv/config';
import { getAuthedClient } from '../../packages/core/client.js';
import { createNode, listNodes, getNodePaths } from '../../packages/core/nodes.js';

const [command, ...args] = process.argv.slice(2);
const { supabase, user } = await getAuthedClient();

if (command === 'create') {
    const [name, nodeType, parentId] = args;
    if (!name || !nodeType) {
        console.error('使い方: node apps/cli/nodes.js create <name> <asset|liability|flow> [parentId]');
        process.exit(1);
    }

    try {
        const node = await createNode(supabase, { userId: user.id, name, nodeType, parentId: parentId ?? null });
        console.log('CREATED', node);
    } catch (error) {
        console.error('ERROR', error.message);
    }
} else if (command === 'list') {
    try {
        const [nodes, paths] = await Promise.all([listNodes(supabase), getNodePaths(supabase)]);
        const pathByNodeId = new Map(paths.map((p) => [p.node_id, p.path]));

        nodes.forEach((n) => {
            console.log(`${n.id} | ${n.node_type.padEnd(9)} | ${pathByNodeId.get(n.id) ?? n.name}`);
        });
    } catch (error) {
        console.error('ERROR', error.message);
    }
} else {
    console.error('使い方: node apps/cli/nodes.js <create|list> ...');
    process.exit(1);
}
