import { createClient } from '@supabase/supabase-js';

function requiredEnv(names) {
    for (const name of names) {
        const value = import.meta.env[name];
        if (value) return value;
    }
    throw new Error(`Missing environment variable. Configure one of these in .env.local: ${names.join(', ')}`);
}

export const supabaseUrl = requiredEnv(['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
const supabaseAnonKey = requiredEnv(['VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
    },
});
