import { createClient } from '@supabase/supabase-js';

let authClient = null;

function getAuthClient(env) {
    if (authClient) return authClient;

    const url = (env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const anonKey = (
        env.VITE_SUPABASE_ANON_KEY
        || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        || ''
    ).trim();

    if (!url || !anonKey) {
        const error = new Error('Supabase URL and publishable key are required for auth validation.');
        error.statusCode = 500;
        throw error;
    }

    authClient = createClient(url, anonKey, { auth: { persistSession: false } });
    return authClient;
}

/**
 * Validate the access token with Supabase Auth before trusting claims.
 */
export async function getUserFromAccessToken(accessToken, env) {
    if (!accessToken) {
        const error = new Error('Missing authorization token.');
        error.statusCode = 401;
        throw error;
    }

    const client = getAuthClient(env);
    const { data: { user }, error } = await client.auth.getUser(accessToken);

    if (error || !user) {
        const authError = new Error('Invalid or expired session. Please log in again.');
        authError.statusCode = 401;
        throw authError;
    }

    return {
        id: user.id,
        email: user.email ?? '',
    };
}
