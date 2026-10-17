import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
    clearPasswordRecoveryPending,
    clearStoredAuthRedirectError,
    getAuthRedirectUrl,
    getPasswordRecoveryRedirectUrl,
    getStoredAuthRedirectError,
    isPasswordRecoveryPending,
} from '../../utils/authRedirect';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthModal({ onClose }) {
    const [mode, setMode] = useState(() => {
        if (!isPasswordRecoveryPending()) return 'login';
        return getStoredAuthRedirectError() ? 'forgot' : 'reset';
    });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState(() => getStoredAuthRedirectError());
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (mode !== 'forgot' || !isPasswordRecoveryPending() || !/code verifier/i.test(errorMsg)) {
            return;
        }

        let cancelled = false;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (cancelled || !session) return;
            clearStoredAuthRedirectError();
            setErrorMsg('');
            setMode('reset');
        });

        return () => {
            cancelled = true;
        };
    }, [errorMsg, mode]);

    const setModeAndClearMessages = (nextMode) => {
        setMode(nextMode);
        setErrorMsg('');
        setSuccessMsg('');
        clearStoredAuthRedirectError();
    };

    const validateEmail = () => {
        if (!email) {
            setErrorMsg('Please provide your email address.');
            return false;
        }

        if (!emailRegex.test(email)) {
            setErrorMsg('Please enter a valid email address format (e.g., user@domain.com).');
            return false;
        }

        return true;
    };

    const handleAction = async (isSignUp) => {
        setErrorMsg('');
        setSuccessMsg('');
        if (!email || !password) {
            setErrorMsg("Please provide both email and password.");
            return;
        }

        if (!validateEmail()) return;

        setLoading(true);
        let error = null;
        let sessionActive = false;

        try {
            if (isSignUp) {
                const res = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: getAuthRedirectUrl(),
                    },
                });
                error = res.error;
                sessionActive = !!res.data?.session;
            } else {
                const res = await supabase.auth.signInWithPassword({ email, password });
                error = res.error;
                sessionActive = !!res.data?.session;
            }
        } catch (err) {
            error = err;
        }

        if (error) {
            setErrorMsg(error.message === 'Failed to fetch'
                ? 'Network blocked! (Check your AdBlocker / Brave Shields)'
                : error.message);
        } else {
            if (isSignUp && !sessionActive) {
                alert('Sign up successful! Please check your email to verify your account.');
            } else {
                onClose();
            }
        }
        setLoading(false);
    };

    const handleForgotPassword = async (event) => {
        event.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!validateEmail()) return;

        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: getPasswordRecoveryRedirectUrl(),
            });

            if (error) {
                setErrorMsg(error.message === 'Failed to fetch'
                    ? 'Network blocked! (Check your AdBlocker / Brave Shields)'
                    : error.message);
            } else {
                clearStoredAuthRedirectError();
                setSuccessMsg('Password reset link sent. Please check your email.');
            }
        } catch (error) {
            setErrorMsg(error.message === 'Failed to fetch'
                ? 'Network blocked! (Check your AdBlocker / Brave Shields)'
                : error.message);
        }
        setLoading(false);
    };

    const handleUpdatePassword = async (event) => {
        event.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!password || !confirmPassword) {
            setErrorMsg('Please enter and confirm your new password.');
            return;
        }

        if (password.length < 6) {
            setErrorMsg('Password must be at least 6 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMsg('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });

            if (error) {
                setErrorMsg(error.message);
            } else {
                clearPasswordRecoveryPending();
                setPassword('');
                setConfirmPassword('');
                setSuccessMsg('Password updated successfully. You are signed in.');
                setTimeout(onClose, 900);
            }
        } catch (error) {
            setErrorMsg(error.message);
        }
        setLoading(false);
    };

    const renderLoginForm = () => (
        <>
            <h2>Welcome Back!</h2>
            <p>Log in to manage your AdsRoad billboards.</p>
            <form onSubmit={(e) => { e.preventDefault(); handleAction(false); }}>
                <div className="input-group">
                    <label>Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => setModeAndClearMessages('forgot')}
                >
                    Forgot password?
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" disabled={loading} className="full-width-btn">
                        {loading ? 'Logging in...' : 'Log In'}
                    </button>
                    <button type="button" onClick={() => handleAction(true)} disabled={loading} className="secondary-btn full-width-btn">
                        Sign Up
                    </button>
                </div>
                <p className="login-confirm-hint">
                    Already signed up or confirmed your email? Click the login button
                </p>
            </form>
        </>
    );

    const renderForgotPasswordForm = () => (
        <>
            <h2>Reset Password</h2>
            <p>Enter your account email and Supabase will send you a reset link.</p>
            <form onSubmit={handleForgotPassword}>
                <div className="input-group">
                    <label>Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="full-width-btn">
                    {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                    type="button"
                    className="auth-link-btn auth-back-btn"
                    onClick={() => setModeAndClearMessages('login')}
                >
                    Back to login
                </button>
            </form>
        </>
    );

    const renderResetPasswordForm = () => (
        <>
            <h2>Choose New Password</h2>
            <p>Create a new password for your AdsRoad account.</p>
            <form onSubmit={handleUpdatePassword}>
                <div className="input-group">
                    <label>New Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label>Confirm New Password</label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="full-width-btn">
                    {loading ? 'Updating...' : 'Update Password'}
                </button>
            </form>
        </>
    );

    return (
        <div className="modal">
            <div className="modal-content login-content modal-fixed-corners">
                <div className="modal-scroll-area">
                    {mode === 'forgot' && renderForgotPasswordForm()}
                    {mode === 'reset' && renderResetPasswordForm()}
                    {mode === 'login' && renderLoginForm()}
                    {errorMsg && <p style={{ color: '#e53e3e', marginTop: '10px', fontSize: '14px' }}>{errorMsg}</p>}
                    {successMsg && <p style={{ color: '#2f855a', marginTop: '10px', fontSize: '14px' }}>{successMsg}</p>}
                </div>
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
        </div>
    );
}
