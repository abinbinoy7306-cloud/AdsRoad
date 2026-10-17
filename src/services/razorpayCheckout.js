import { supabase } from './supabaseClient';

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const CREATE_ORDER_URL = '/api/create-order';
const VERIFY_PAYMENT_URL = '/api/verify-payment';
const EDGE_CREATE_ORDER_FN = import.meta.env.VITE_RAZORPAY_CREATE_ORDER_FN ?? 'create-razorpay-order';
const EDGE_VERIFY_PAYMENT_FN = import.meta.env.VITE_RAZORPAY_VERIFY_PAYMENT_FN ?? 'verify-razorpay-payment';
const RAZORPAY_API_MODE = (import.meta.env.VITE_RAZORPAY_API_MODE ?? 'auto').toLowerCase();

export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID ?? '';
export const RAZORPAY_AMOUNT_PAISE = Number(import.meta.env.VITE_RAZORPAY_AMOUNT_PAISE ?? 10000);
export const RAZORPAY_CURRENCY = import.meta.env.VITE_RAZORPAY_CURRENCY ?? 'INR';
const RAZORPAY_PLAN_LABEL = import.meta.env.VITE_RAZORPAY_PLAN_LABEL ?? 'Billboard Ad Space (1 month)';

let checkoutScriptPromise = null;

export function isRazorpayConfigured() {
    return Boolean(RAZORPAY_KEY_ID);
}

export function isRazorpayTestMode() {
    return RAZORPAY_KEY_ID.startsWith('rzp_test_');
}

export function formatRazorpayFailureMessage(description = '') {
    const lower = description.toLowerCase();

    if (lower.includes('international card')) {
        return 'International cards are not enabled on this Razorpay account. For testing, use an Indian test card (4111 1111 1111 1111) or UPI in the checkout modal — not a foreign card.';
    }

    return description || 'Payment failed.';
}

export function formatRazorpayPrice(
    amountPaise = RAZORPAY_AMOUNT_PAISE,
    currency = RAZORPAY_CURRENCY,
) {
    const amount = amountPaise / 100;
    if (currency === 'INR') {
        return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function loadCheckoutScript() {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Razorpay checkout is only available in the browser.'));
    }

    if (window.Razorpay) {
        return Promise.resolve(window.Razorpay);
    }

    if (!checkoutScriptPromise) {
        checkoutScriptPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_URL}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve(window.Razorpay));
                existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout.')));
                return;
            }

            const script = document.createElement('script');
            script.src = CHECKOUT_SCRIPT_URL;
            script.async = true;
            script.onload = () => resolve(window.Razorpay);
            script.onerror = () => reject(new Error('Failed to load Razorpay checkout.'));
            document.body.appendChild(script);
        });
    }

    return checkoutScriptPromise;
}

async function getAccessToken() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        const message = error.message === 'Failed to fetch'
            ? 'Could not reach Supabase. Check your internet, then log in again.'
            : error.message;
        throw new Error(message);
    }

    if (!session?.access_token) {
        throw new Error('Please log in before paying with Razorpay.');
    }

    return session.access_token;
}

async function postJson(url, body, requireAuth = true) {
    const edgeFunctionName = url === CREATE_ORDER_URL
        ? EDGE_CREATE_ORDER_FN
        : url === VERIFY_PAYMENT_URL
            ? EDGE_VERIFY_PAYMENT_FN
            : '';

    const canUseEdgeFunction = Boolean(edgeFunctionName);
    const callEdgeFunction = async () => {
        if (!canUseEdgeFunction) {
            throw new Error('Payment server is not configured.');
        }

        const { data, error } = await supabase.functions.invoke(edgeFunctionName, { body });
        if (error) {
            throw new Error(error.message || 'Payment request failed.');
        }
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid response from payment server.');
        }
        return data;
    };

    if (RAZORPAY_API_MODE === 'edge') {
        return callEdgeFunction();
    }

    const headers = { 'Content-Type': 'application/json' };

    if (requireAuth) {
        headers.Authorization = `Bearer ${await getAccessToken()}`;
    }

    let response;

    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
    } catch {
        if (canUseEdgeFunction) {
            return callEdgeFunction();
        }
        throw new Error('Payment server is not running. Start it with: npm run dev');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        if (canUseEdgeFunction) {
            return callEdgeFunction();
        }
        throw new Error('Invalid response from payment server.');
    }

    let data = {};
    try {
        data = await response.json();
    } catch {
        if (canUseEdgeFunction) {
            return callEdgeFunction();
        }
        throw new Error('Invalid response from payment server.');
    }

    if (!response.ok) {
        throw new Error(data?.error || `Payment request failed (${response.status}).`);
    }

    return data;
}

/**
 * Razorpay Standard Web Checkout — create order, open modal, verify signature.
 * @see https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
 */
export async function startBillboardRazorpayCheckout({ user, onDismiss, currency, amountMinorUnits } = {}) {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay is not configured. Set VITE_RAZORPAY_KEY_ID in .env');
    }

    if (!user?.id) {
        throw new Error('Please log in before paying with Razorpay.');
    }

    const [Razorpay, order] = await Promise.all([
        loadCheckoutScript(),
        postJson(CREATE_ORDER_URL, {
            amount: amountMinorUnits ?? RAZORPAY_AMOUNT_PAISE,
            currency: currency ?? RAZORPAY_CURRENCY,
            purpose: 'billboard_subscription',
        }),
    ]);

    if (!order?.order_id || !order?.amount || !order?.currency) {
        throw new Error(order?.error || 'Invalid order response from server.');
    }

    return new Promise((resolve, reject) => {
        const checkout = new Razorpay({
            key: RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency,
            name: 'AdsRoad',
            description: RAZORPAY_PLAN_LABEL,
            order_id: order.order_id,
            prefill: {
                name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                email: user.email || '',
            },
            theme: { color: '#ecc94b' },
            handler: async (response) => {
                try {
                    const result = await postJson(VERIFY_PAYMENT_URL, {
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                    });

                    if (!result?.success) {
                        throw new Error(result?.error || 'Payment could not be verified.');
                    }

                    resolve(response);
                } catch (verificationError) {
                    reject(verificationError);
                }
            },
            modal: {
                ondismiss: () => {
                    onDismiss?.();
                    reject(new Error('Payment cancelled.'));
                },
            },
        });

        checkout.on('payment.failed', (event) => {
            reject(new Error(formatRazorpayFailureMessage(event.error?.description)));
        });

        checkout.open();
    });
}
