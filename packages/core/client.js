import { createClient } from '@supabase/supabase-js';

export function createSupabaseClient(url, anonKey) {
    return createClient(url, anonKey);
}

// CLI-only: relies on process.env, so callers must `import 'dotenv/config'`
// before calling this. Never used from apps/web.
export async function getAuthedClient() {
    const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data, error } = await supabase.auth.signInWithPassword({
        email: process.env.SUPABASE_EMAIL,
        password: process.env.SUPABASE_PASSWORD
    });

    if (error) throw error;
    return { supabase, user: data.user };
}
