/*
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
*/

import { getAuthedClient } from "./lib/auth.js";

const {supabase, user} = await getAuthedClient();

const [accountId, categoryId, amount, ...memoParts] = process.argv.slice(2);
const memo = memoParts.join(' ');

const { data, error } = await supabase
    .from('transaction')
    .insert({
        accounts_id: Number(accountId),
        category_id: Number(categoryId),
        amount: Number(amount),
        memo,
        user_id: user.id
    })
    .select();

if (error) {
    console.error('ERROR', error.message)
} else {
    console.log('REGISTERED', data[0])
}
