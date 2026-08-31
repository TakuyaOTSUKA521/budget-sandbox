import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const [email, password] = process.argv.slice(2);

const {data, error} = await supabase.auth.signUp({email, password});

if (error) {
    console.log("ERROR", error.message);
} else {
    console.log("Sign up succeeded. User ID:", data.user.id);
}
