import { supabase } from '../services/supabaseClient';

const PASSWORD_RECOVERY_STORAGE_KEY = 'adsroad_password_recovery_pending_v1';
const AUTH_REDIRECT_ERROR_STORAGE_KEY = 'adsroad_auth_redirect_error_v1';

let authRedirectCompletionPromise = null;

export function getAuthRedirectUrl() {
    if (typeof window === 'undefined') return '';
    const configuredSiteUrl = import.meta.env.VITE_SITE_URL || import.meta.env.NEXT_PUBLIC_SITE_URL;
    const origin = (configuredSiteUrl || window.location.origin).replace(/\/$/, '');
    return `${origin}/`;
}

export function getPasswordRecoveryRedirectUrl() {
    const redirectUrl = getAuthRedirectUrl();
    if (!redirectUrl) return '';

    const url = new URL(redirectUrl);
    url.searchParams.set('auth', 'recovery');
    return url.toString();
}

function getHashParams() {
    if (typeof window === 'undefined' || !window.location.hash) {
        return new URLSearchParams();
    }
    return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export function hasAuthRedirectParams() {
    if (typeof window === 'undefined') return false;

    const query = new URLSearchParams(window.location.search);
    const hash = getHashParams();

    return Boolean(
        query.get('code')
        || query.get('token_hash')
        || query.get('auth') === 'recovery'
        || query.get('error')
        || hash.get('access_token')
        || hash.get('error')
        || hash.get('type'),
    );
}

export function clearAuthRedirectParams() {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, document.title, window.location.pathname || '/');
}

export function markPasswordRecoveryPending() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, 'true');
}

export function clearPasswordRecoveryPending() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_REDIRECT_ERROR_STORAGE_KEY);
}

export function isPasswordRecoveryPending() {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === 'true';
}

function getAuthRedirectError(query, hash) {
    const errorCode = query.get('error_code') || hash.get('error_code');
    const errorDescription = query.get('error_description') || hash.get('error_description');

    if (!query.get('error') && !hash.get('error') && !errorCode && !errorDescription) {
        return '';
    }

    if (errorCode === 'otp_expired') {
        return 'That password reset link is invalid or has expired. Please send yourself a fresh reset link.';
    }

    return errorDescription || 'The authentication link could not be used. Please request a new link.';
}

export function getStoredAuthRedirectError() {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem(AUTH_REDIRECT_ERROR_STORAGE_KEY) || '';
}

export function clearStoredAuthRedirectError() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(AUTH_REDIRECT_ERROR_STORAGE_KEY);
}

function isPkceVerifierError(error) {
    return /code verifier/i.test(error?.message || '');
}

async function completeAuthRedirectOnce() {
    const query = new URLSearchParams(window.location.search);
    const hash = getHashParams();
    const code = query.get('code');
    const tokenHash = query.get('token_hash');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const type = query.get('type') || hash.get('type') || 'email';
    const hasRecoveryCallback = Boolean(code || tokenHash || accessToken);
    const isRecovery = (query.get('auth') === 'recovery' || type === 'recovery') && hasRecoveryCallback;
    const redirectError = getAuthRedirectError(query, hash);

    if (isRecovery) {
        markPasswordRecoveryPending();
    }

    if (redirectError) {
        window.sessionStorage.setItem(AUTH_REDIRECT_ERROR_STORAGE_KEY, redirectError);
        clearAuthRedirectParams();
        return false;
    }

    try {
        if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
        } else if (tokenHash) {
            const { error } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type,
            });
            if (error) throw error;
        } else if (accessToken && refreshToken) {
            const { data: { session }, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            if (error) throw error;
            if (!session) return false;
        } else if (accessToken) {
            throw new Error('The password reset link is missing a refresh token. Please request a new link.');
        } else {
            return false;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return false;

        clearStoredAuthRedirectError();
        clearAuthRedirectParams();
        return true;
    } catch (error) {
        console.error('Failed to complete email confirmation login:', error);

        const { data: { session } } = await supabase.auth.getSession();
        if (isRecovery && session && isPkceVerifierError(error)) {
            markPasswordRecoveryPending();
            clearStoredAuthRedirectError();
            clearAuthRedirectParams();
            return true;
        }

        if (isRecovery) {
            window.sessionStorage.setItem(
                AUTH_REDIRECT_ERROR_STORAGE_KEY,
                error?.message || 'The password reset link could not be used. Please request a new link.',
            );
            clearAuthRedirectParams();
        }
        return false;
    }
}

/**
 * Complete login after the user returns from a Supabase email confirmation link.
 * @returns {Promise<boolean>} true when a session was established
 */
export async function completeAuthRedirect() {
    if (typeof window === 'undefined' || !hasAuthRedirectParams()) {
        return false;
    }

    if (!authRedirectCompletionPromise) {
        authRedirectCompletionPromise = completeAuthRedirectOnce().finally(() => {
            authRedirectCompletionPromise = null;
        });
    }

    return authRedirectCompletionPromise;
}
