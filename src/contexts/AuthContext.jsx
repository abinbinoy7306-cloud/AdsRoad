/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    clearAuthRedirectParams,
    completeAuthRedirect,
    hasAuthRedirectParams,
    markPasswordRecoveryPending,
} from '../utils/authRedirect';

const AuthContext = createContext(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [eggBalance, setEggBalance] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async (userId) => {
        const { data } = await supabase
            .from('profiles')
            .select('egg_count')
            .eq('id', userId)
            .single();
        if (data) {
            const nextBalance = data.egg_count || 0;
            setEggBalance((current) => (current === nextBalance ? current : nextBalance));
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const applySession = (session) => {
            if (!mounted) return;
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setEggBalance(0);
            }
        };

        const initAuth = async () => {
            if (hasAuthRedirectParams()) {
                await completeAuthRedirect();
            }

            const { data: { session } } = await supabase.auth.getSession();
            applySession(session);
            if (mounted) {
                setLoading(false);
            }
        };

        void initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                markPasswordRecoveryPending();
            }

            applySession(session);

            if (
                (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')
                && (hasAuthRedirectParams() || window.location.hash.includes('access_token'))
            ) {
                clearAuthRedirectParams();
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const updateEggBalanceLocal = useCallback((newBalance) => {
        setEggBalance(newBalance);
        if (user) {
            supabase
                .from('profiles')
                .update({ egg_count: newBalance })
                .eq('id', user.id)
                .then(({ error }) => {
                    if (error) console.error('Failed to sync egg balance:', error);
                });
        }
    }, [user]);

    const contextValue = useMemo(
        () => ({ user, eggBalance, updateEggBalanceLocal, loading }),
        [user, eggBalance, updateEggBalanceLocal, loading],
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}
