import { loadEnv } from 'vite';
import { getUserFromAccessToken } from './server/auth.js';
import {
    createOrder,
    createRazorpayClient,
    formatOrderResponse,
    verifyPaymentSignature,
} from './server/razorpay.js';

const ORDER_OWNERS_TTL_MS = 30 * 60 * 1000;
const MAX_TRACKED_ORDERS = 2_000;
const DEFAULT_ALLOWED_ORIGINS = new Set([
    'https://www.adsroadindia.com',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]);

function getAllowedOrigins(env) {
    const configured = [
        env.VITE_APP_ORIGIN,
        env.PUBLIC_SITE_URL,
        env.SITE_URL,
        env.VITE_SITE_URL,
    ]
        .filter(Boolean)
        .map((origin) => String(origin).trim().replace(/\/$/, ''));

    return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(origin, allowedOrigins) {
    if (!origin) return true;
    return allowedOrigins.has(origin);
}

function readJsonBody(req, maxBytes = 100_000) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalBytes = 0;
        req.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                const error = new Error('Request body too large.');
                error.statusCode = 413;
                reject(error);
                req.destroy();
                return;
            }
            chunks.push(chunk.toString('utf8'));
        });
        req.on('end', () => {
            try {
                const raw = chunks.join('');
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(new Error('Invalid JSON body.'));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}

function getPathname(url = '') {
    return url.split('?')[0];
}

function normalizeCurrency(currency) {
    const value = String(currency || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(value) ? value : '';
}

function normalizeAmount(amount, fallbackAmount) {
    const value = Number(amount);
    if (Number.isFinite(value) && value >= 1) {
        return value;
    }

    return Number(fallbackAmount) >= 1 ? Number(fallbackAmount) : 10000;
}

async function getUserFromRequest(req, env) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        const error = new Error('Authorization required.');
        error.statusCode = 401;
        throw error;
    }

    try {
        return await getUserFromAccessToken(authHeader.slice(7).trim(), env);
    } catch {
        const error = new Error('Invalid or expired session. Please log in again.');
        error.statusCode = 401;
        throw error;
    }
}

function handleApiError(res, error) {
    const status = error?.statusCode ?? 400;
    const message = error instanceof Error ? error.message : 'Request failed.';
    console.error('[razorpay-api]', message);
    sendJson(res, status, { error: message, success: false });
}

function pruneOrderOwners(orderOwnerById) {
    const cutoff = Date.now() - ORDER_OWNERS_TTL_MS;
    for (const [orderId, orderData] of orderOwnerById.entries()) {
        if (!orderData || orderData.createdAt < cutoff) {
            orderOwnerById.delete(orderId);
        }
    }

    if (orderOwnerById.size <= MAX_TRACKED_ORDERS) return;

    const sortedEntries = Array.from(orderOwnerById.entries())
        .sort((a, b) => (a[1]?.createdAt ?? 0) - (b[1]?.createdAt ?? 0));
    const entriesToRemove = sortedEntries.length - MAX_TRACKED_ORDERS;
    for (let index = 0; index < entriesToRemove; index += 1) {
        orderOwnerById.delete(sortedEntries[index][0]);
    }
}

function registerRazorpayApi(server) {
    const env = loadEnv(server.config.mode, server.config.root, '');
    let razorpayClient = null;
    let keySecret = '';
    const orderOwnerById = new Map();
    const allowedOrigins = getAllowedOrigins(env);

    const getRazorpay = () => {
        if (!razorpayClient) {
            razorpayClient = createRazorpayClient(env);
            keySecret = env.RAZORPAY_KEY_SECRET;
        }
        return razorpayClient;
    };

    server.middlewares.use(async (req, res, next) => {
        const pathname = getPathname(req.url);

        if (pathname !== '/api/create-order' && pathname !== '/api/verify-payment') {
            next();
            return;
        }

        const origin = req.headers.origin;
        if (!isAllowedOrigin(origin, allowedOrigins)) {
            sendJson(res, 403, { error: 'Origin not allowed.', success: false });
            return;
        }

        if (req.method === 'OPTIONS') {
            if (origin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.statusCode = 204;
            res.end();
            return;
        }

        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }

        if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed.', success: false });
            return;
        }

        try {
            const contentType = String(req.headers['content-type'] || '').toLowerCase();
            if (!contentType.includes('application/json')) {
                sendJson(res, 415, { error: 'Content-Type must be application/json.', success: false });
                return;
            }
            const body = await readJsonBody(req);
            pruneOrderOwners(orderOwnerById);

            if (pathname === '/api/create-order') {
                const user = await getUserFromRequest(req, env);
                const amount = normalizeAmount(body.amount, env.VITE_RAZORPAY_AMOUNT_PAISE ?? 10000);
                const currency = normalizeCurrency(body.currency ?? env.VITE_RAZORPAY_CURRENCY ?? 'INR');

                const order = await createOrder(getRazorpay(), {
                    amount,
                    currency,
                    receipt: body.receipt ?? `adsroad_${user.id.slice(0, 8)}_${Date.now()}`,
                    notes: {
                        user_id: user.id,
                        purpose: body.purpose ?? 'billboard_subscription',
                    },
                });
                orderOwnerById.set(order.id, { userId: user.id, createdAt: Date.now() });

                sendJson(res, 200, formatOrderResponse(order));
                return;
            }

            if (pathname === '/api/verify-payment') {
                const user = await getUserFromRequest(req, env);
                const orderId = body.razorpay_order_id;
                const paymentId = body.razorpay_payment_id;
                const signature = body.razorpay_signature;

                if (!orderId || !paymentId || !signature) {
                    sendJson(res, 400, {
                        success: false,
                        error: 'Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature.',
                    });
                    return;
                }

                const expectedOwner = orderOwnerById.get(orderId);
                if (!expectedOwner || expectedOwner.userId !== user.id) {
                    sendJson(res, 403, { success: false, error: 'Order does not belong to this user.' });
                    return;
                }

                const verified = verifyPaymentSignature(
                    keySecret,
                    orderId,
                    paymentId,
                    signature,
                );

                if (!verified) {
                    sendJson(res, 400, { success: false, error: 'Invalid payment signature.' });
                    return;
                }

                sendJson(res, 200, {
                    success: true,
                    order_id: orderId,
                    payment_id: paymentId,
                });
                orderOwnerById.delete(orderId);
                return;
            }
        } catch (error) {
            handleApiError(res, error);
        }
    });
}

export function razorpayApiPlugin() {
    return {
        name: 'razorpay-api',
        configureServer: registerRazorpayApi,
        configurePreviewServer: registerRazorpayApi,
    };
}
