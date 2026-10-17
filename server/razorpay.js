import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

function normalizeCurrency(currency) {
    const value = String(currency || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(value) ? value : '';
}

export function getRazorpayCredentials(env) {
    const keyId = (env.RAZORPAY_KEY_ID || env.VITE_RAZORPAY_KEY_ID || '').trim();
    const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();

    if (!keyId || !keySecret) {
        const error = new Error('Razorpay credentials are not configured in .env');
        error.statusCode = 500;
        throw error;
    }

    return { keyId, keySecret };
}

export function createRazorpayClient(env) {
    const { keyId, keySecret } = getRazorpayCredentials(env);
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * @param {import('razorpay').Orders.RazorpayOrder} order
 */
export function formatOrderResponse(order) {
    return {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
    };
}

export async function createOrder(razorpay, { amount, currency, receipt, notes }) {
    if (!Number.isFinite(amount) || amount < 1) {
        const error = new Error('Amount must be at least 1 minor unit.');
        error.statusCode = 400;
        throw error;
    }

    const normalizedCurrency = normalizeCurrency(currency);
    if (!normalizedCurrency) {
        const error = new Error('Currency must be a valid 3-letter ISO code.');
        error.statusCode = 400;
        throw error;
    }

    try {
        return await razorpay.orders.create({
            amount: Math.round(amount),
            currency: normalizedCurrency,
            receipt,
            notes,
        });
    } catch (cause) {
        const description = cause?.error?.description || cause?.message || 'Razorpay order creation failed.';
        const isAuthFailure = cause?.statusCode === 401
            || description.toLowerCase().includes('authentication failed');

        const error = new Error(
            isAuthFailure
                ? 'Razorpay Key ID and Key Secret do not match. In Dashboard → Settings → API Keys (Test mode), generate a new key pair and update both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local, then restart npm run dev.'
                : description,
        );
        error.statusCode = isAuthFailure ? 401 : 500;
        throw error;
    }
}

export function verifyPaymentSignature(keySecret, orderId, paymentId, signature) {
    const expected = createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(String(signature || ''), 'utf8');
    if (expectedBuffer.length !== actualBuffer.length) {
        return false;
    }
    return timingSafeEqual(expectedBuffer, actualBuffer);
}
