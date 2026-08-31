/*
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
*/

import { getAuthedClient } from "./lib/auth.js";

const { supabase } = await getAuthedClient();

const { data, error } = await supabase
    .from('transaction')
    .select(`
        id,
        amount,
        memo,
        transaction_date,
        categories ( name ),
        accounts ( name )
    `)
    .order('transaction_date', { ascending: true });

if (error) {
    console.error("ERROR", error.message);
} else {
    data.forEach((t) => {
        console.log(
            `${t.transaction_date} | ${t.accounts.name.padEnd(10)} | ${t.categories.name.padEnd(10)} | ${String(t.amount).padStart(8)} |${t.memo ?? ''}`
        );
    });
}
