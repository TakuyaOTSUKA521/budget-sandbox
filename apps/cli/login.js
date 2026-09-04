import 'dotenv/config';
import { createSupabaseClient } from '../../packages/core/client.js';

const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const [email, password] = process.argv.slice(2);

const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error) {
    console.error("ERROR", error.message);
} else {
    console.log('ログイン成功。ユーザーID:', data.user.id);
    console.log('---');
    console.log('Access Token (JWT):');
    console.log(data.session.access_token);
}
