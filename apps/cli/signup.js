import 'dotenv/config';
import { createSupabaseClient } from '../../packages/core/client.js';

const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const [email, password] = process.argv.slice(2);

const { data, error } = await supabase.auth.signUp({ email, password });

if (error) {
    console.log("ERROR", error.message);
} else {
    console.log("Sign up succeeded. User ID:", data.user.id);
}
