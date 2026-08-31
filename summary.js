import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const { data, error } = await supabase
    .from('transaction')
    .select('amount, categories ( name ) ');

if (error) {
    console.error("ERROR", error.message);
} else {
    const summary = data.reduce((acc, t) => {
        const name = t.categories.name;
        acc[name] = (acc[name] || 0) + Number(t.amount);
        return acc;
    }, {});

    Object.entries(summary)
        .sort(([, a], [, b]) => a - b)
        .forEach(([name, total]) => {
            console.log(`${name.padEnd(10)} : ${total}`);
        });
}
