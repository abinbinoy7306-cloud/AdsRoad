import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const CHECKOUT_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CHF'];
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.53,
  CAD: 1.36,
  SGD: 1.34,
  AED: 3.67,
  JPY: 150,
  CHF: 0.88,
};
const LIVE_RATE_CACHE_MS = 30 * 60 * 1000;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://www.adsroadindia.com',
  'http://localhost:3000',
]);

const PROVIDERS = [
  {
    name: 'frankfurter.app',
    url: 'https://api.frankfurter.app/latest?from=USD',
    parse: (data: any) => ({ USD: 1, ...(data?.rates ?? {}) }),
  },
  {
    name: 'exchangerate.host',
    url: 'https://api.exchangerate.host/latest?base=USD',
    parse: (data: any) => ({ USD: 1, ...(data?.rates ?? {}) }),
  },
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (data: any) => ({ USD: 1, ...(data?.rates ?? {}) }),
  },
];

let cachedRates: { rates: Record<string, number>; live: boolean; provider: string } | null = null;
let cachedRatesAt = 0;
let inflightRatesRequest: Promise<{ rates: Record<string, number>; live: boolean; provider: string }> | null = null;

function normalizeCurrency(currency: unknown) {
  const value = String(currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : '';
}

function getAllowedOrigins() {
  const configured = [
    Deno.env.get('SITE_URL'),
    Deno.env.get('PUBLIC_SITE_URL'),
    Deno.env.get('VITE_SITE_URL'),
    Deno.env.get('VITE_APP_ORIGIN'),
  ]
    .filter(Boolean)
    .map((origin) => String(origin).trim().replace(/\/$/, ''));

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  return getAllowedOrigins().has(origin);
}

export function rejectDisallowedOrigin(origin: string | null) {
  return Boolean(origin && !isAllowedOrigin(origin));
}

function corsHeadersForOrigin(origin: string | null) {
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } as Record<string, string>;

  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function jsonResponse(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForOrigin(origin),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}

export function optionsResponse(origin: string | null = null) {
  return new Response('ok', { headers: corsHeadersForOrigin(origin) });
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function withRequiredCurrencies(rates: Record<string, number>) {
  const filled: Record<string, number> = { USD: 1, ...(rates ?? {}) };
  for (const code of CHECKOUT_CURRENCIES) {
    if (filled[code] == null) {
      filled[code] = FALLBACK_USD_RATES[code] ?? 1;
    }
  }
  return filled;
}

function hasRequiredLiveRates(rates: Record<string, number>) {
  const required = ['USD', 'INR', 'EUR', 'GBP'];
  return required.every((code) => Number.isFinite(rates?.[code]) && rates[code] > 0);
}

async function fetchProviderRates(provider: typeof PROVIDERS[number], timeoutMs: number) {
  const data = await fetchJsonWithTimeout(provider.url, timeoutMs);
  const parsed = provider.parse(data);

  if (!hasRequiredLiveRates(parsed) || !Number.isFinite(parsed.USD) || parsed.USD <= 0) {
    throw new Error(`${provider.name}: missing required live rates`);
  }

  return {
    rates: withRequiredCurrencies(parsed),
    live: true,
    provider: provider.name,
  };
}

export async function fetchUsdExchangeRates({ timeoutMs = 6000 } = {}) {
  if (cachedRates && (Date.now() - cachedRatesAt) < LIVE_RATE_CACHE_MS) {
    return cachedRates;
  }

  if (inflightRatesRequest) {
    return inflightRatesRequest;
  }

  const request = Promise.any(
    PROVIDERS.map((provider) => fetchProviderRates(provider, timeoutMs)),
  ).catch(() => ({
    rates: withRequiredCurrencies(FALLBACK_USD_RATES),
    live: false,
    provider: 'fallback',
  })).finally(() => {
    inflightRatesRequest = null;
  });

  inflightRatesRequest = request;
  const result = await request;

  if (result.live) {
    cachedRates = result;
    cachedRatesAt = Date.now();
  }

  return result;
}

export async function resolveCheckoutAmount(currency: unknown, { basePriceUsd = 1 } = {}) {
  const normalizedCurrency = normalizeCurrency(currency);
  if (!normalizedCurrency) {
    const error = new Error('Currency must be a valid 3-letter ISO code.');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  const { rates } = await fetchUsdExchangeRates();
  const converted = basePriceUsd * (rates[normalizedCurrency] ?? 1);
  const amount = normalizedCurrency === 'JPY'
    ? Math.round(converted)
    : Math.round(converted * 100);

  if (!Number.isFinite(amount) || amount < 1) {
    const error = new Error('Resolved checkout amount is invalid.');
    (error as Error & { statusCode?: number }).statusCode = 500;
    throw error;
  }

  return { amount, currency: normalizedCurrency };
}

function getRazorpayCredentials() {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured on the server.');
  }

  return { keyId, keySecret };
}

export async function createRazorpayOrder({
  amount,
  currency,
  receipt,
  notes,
}: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId, keySecret } = getRazorpayCredentials();
  const token = btoa(`${keyId}:${keySecret}`);

  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, currency, receipt, notes }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error?.description || payload?.error?.reason || 'Failed to create Razorpay order.',
    );
  }

  return payload;
}

export async function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
) {
  const { keySecret } = getRazorpayCredentials();
  const body = `${orderId}|${paymentId}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(signature ?? '');
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function createSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin credentials are not configured.');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization token.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase auth credentials are not configured.');
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized.');
  }

  return user;
}
