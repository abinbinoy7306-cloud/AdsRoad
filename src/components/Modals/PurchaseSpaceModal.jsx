import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    formatRazorpayFailureMessage,
    isRazorpayConfigured,
    startBillboardRazorpayCheckout,
} from '../../services/razorpayCheckout';
import {
    CHECKOUT_CURRENCIES,
    DISCOUNTED_PRICE_USD,
    ORIGINAL_PRICE_USD,
    convertUsdToCurrency,
    fetchUsdExchangeRates,
    formatCheckoutPrice,
} from '../../utils/currencyPricing';

const DEV_SKIP_PAYMENT = import.meta.env.DEV
    && import.meta.env.VITE_DEV_SKIP_RAZORPAY_PAYMENT === 'true';

function formatPaymentError(error) {
    const message = error instanceof Error ? error.message : 'Payment failed.';

    if (message === 'Failed to fetch') {
        return 'Network error — restart npm run dev, stay logged in, and check your internet or firewall.';
    }

    if (message.includes('Could not reach Razorpay')) {
        return `${message} If you are on a restricted network, try mobile hotspot or set VITE_DEV_SKIP_RAZORPAY_PAYMENT=true in .env.local for local testing.`;
    }

    if (message.toLowerCase().includes('international card')) {
        return formatRazorpayFailureMessage(message);
    }

    if (message.toLowerCase().includes('key id and key secret')
        || message.toLowerCase().includes('authentication failed')) {
        return 'Razorpay API keys are invalid or mismatched. Open Razorpay Dashboard → Settings → API Keys (Test mode), copy a fresh Key ID + Secret into .env.local, restart npm run dev.';
    }

    return message;
}

export default function PurchaseSpaceModal({ onClose, onProceed }) {
    const { user, eggBalance, updateEggBalanceLocal } = useAuth();
    const [isPaying, setIsPaying] = useState(false);
    const [paymentError, setPaymentError] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [exchangeRates, setExchangeRates] = useState({ USD: 1 });

    useEffect(() => {
        let cancelled = false;

        const refreshRates = async (forceRefresh = false) => {
            try {
                const result = await fetchUsdExchangeRates({ forceRefresh });
                if (!cancelled) {
                    setExchangeRates(result.rates);
                }
            } catch {
                // keep existing rates on unexpected errors
            }
        };

        void refreshRates(true);

        const handleVisibilityChange = () => {
            if (!cancelled && document.visibilityState === 'visible') {
                void refreshRates(true);
            }
        };

        const handleFocus = () => {
            if (!cancelled) {
                void refreshRates(true);
            }
        };

        // Refresh regularly so the price stays live in long sessions.
        const interval = setInterval(() => {
            void refreshRates(true);
        }, 15 * 60 * 1000);

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const discountedPriceLabel = useMemo(
        () => formatCheckoutPrice(DISCOUNTED_PRICE_USD, currency, exchangeRates),
        [currency, exchangeRates],
    );

    const originalPriceLabel = useMemo(
        () => formatCheckoutPrice(ORIGINAL_PRICE_USD, currency, exchangeRates),
        [currency, exchangeRates],
    );

    const razorpayReady = isRazorpayConfigured();

    const handlePayEggs = () => {
        if (eggBalance >= 50) {
            updateEggBalanceLocal(eggBalance - 50);
            onProceed();
        } else {
            alert(`Not enough eggs! You need ${50 - eggBalance} more.`);
        }
    };

    const handlePayCash = async () => {
        setPaymentError('');

        if (!user) {
            setPaymentError('Please log in before subscribing with Razorpay.');
            return;
        }

        if (!razorpayReady) {
            setPaymentError(
                'Razorpay is not configured yet. Add VITE_RAZORPAY_KEY_ID to .env.local and deploy Supabase Edge Functions (see README).',
            );
            return;
        }

        setIsPaying(true);

        try {
            const liveRates = await fetchUsdExchangeRates({ forceRefresh: true });
            // Razorpay expects the amount in the smallest currency unit:
            // - INR: paise (x 100)
            // - Most currencies: cents (x 100)
            // - JPY: whole units (x 1)
            const discountedValue = convertUsdToCurrency(DISCOUNTED_PRICE_USD, currency, liveRates.rates);
            const amountMinorUnits = currency === 'JPY'
                ? Math.round(discountedValue)
                : Math.round(discountedValue * 100);

            await startBillboardRazorpayCheckout({
                user,
                currency,
                amountMinorUnits,
            });
            onProceed();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Payment failed.';
            if (message !== 'Payment cancelled.') {
                setPaymentError(formatPaymentError(error));
            }
        } finally {
            setIsPaying(false);
        }
    };

    const handleDevSkipPayment = () => {
        if (!DEV_SKIP_PAYMENT) return;
        onProceed();
    };

    return (
        <div className="modal">
            <div className="modal-content modal-fixed-corners purchase-modal">
                <div className="modal-scroll-area purchase-modal-scroll">
                    <h2 className="purchase-modal-title">Buy Billboard Ad Space</h2>
                    <p className="purchase-modal-subtitle">
                        Become an advertiser and broadcast your message to millions on AdsRoad!
                    </p>
                    <div className="subscription-options">
                        <div className="sub-card sub-card-razorpay">
                            <h3>Pay with Razorpay</h3>
                            <p className="promo-desc">Get 50% Off Now</p>
                            <p className="original-price">{originalPriceLabel}/month</p>
                            <div className="checkout-currency-row">
                                <label className="checkout-currency-field">
                                    <span className="checkout-currency-label">Currency</span>
                                    <div className="checkout-currency-inline">
                                        <select
                                            className="checkout-currency-select"
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value)}
                                            disabled={isPaying}
                                            aria-label="Select display currency"
                                        >
                                            {CHECKOUT_CURRENCIES.map(({ code, label }) => (
                                                <option key={code} value={code}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="checkout-live-price">
                                            {discountedPriceLabel}
                                            <span> / month</span>
                                        </p>
                                    </div>
                                </label>
                            </div>
                            <button
                                type="button"
                                className="checkout-action-btn"
                                onClick={handlePayCash}
                                disabled={isPaying}
                            >
                                {isPaying ? 'Opening checkout…' : `Subscribe (${discountedPriceLabel})`}
                            </button>
                            {!razorpayReady && (
                                <p className="payment-hint">Razorpay keys are not set in the environment.</p>
                            )}
                            {DEV_SKIP_PAYMENT && (
                                <button
                                    type="button"
                                    className="secondary-btn dev-skip-payment-btn"
                                    onClick={handleDevSkipPayment}
                                    disabled={isPaying}
                                >
                                    Dev: skip payment &amp; continue
                                </button>
                            )}
                        </div>
                        <div className="sub-card sub-card-eggs">
                            <h3>Pay with Eggs</h3>
                            <p className="price eggs-price">
                                50 Eggs <span>/ month</span>
                            </p>
                            <p className="eggs-subcopy">
                                Exchange 50 goldens eggs and purchase a free ad space
                            </p>
                            <button
                                type="button"
                                className="checkout-action-btn"
                                onClick={handlePayEggs}
                                disabled={isPaying}
                            >
                                Exchange 50 Eggs
                            </button>
                        </div>
                    </div>
                    {paymentError && (
                        <p className="payment-error" role="alert">
                            {paymentError}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    className="close-btn"
                    onClick={onClose}
                    disabled={isPaying}
                    aria-label="Close"
                >
                    &times;
                </button>
            </div>
        </div>
    );
}
