import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';


export async function getAuthedClient() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data, error } = await supabase.auth.signInWithPassword({
        email: process.env.SUPABASE_EMAIL, 
        password: process.env.SUPABASE_PASSWORD
    });

    if (error) throw error;
    return { supabase, user: data.user };
}