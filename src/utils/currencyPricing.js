import { supabase } from '../services/supabaseClient';

/** Monthly billboard price in USD (50% off from $2). */
export const DISCOUNTED_PRICE_USD = 1;
export const ORIGINAL_PRICE_USD = 2;

export const CHECKOUT_CURRENCIES = [
    { code: 'USD', label: 'USD' },
    { code: 'INR', label: 'INR' },
    { code: 'EUR', label: 'EUR' },
    { code: 'GBP', label: 'GBP' },
    { code: 'AUD', label: 'AUD' },
    { code: 'CAD', label: 'CAD' },
    { code: 'SGD', label: 'SGD' },
    { code: 'AED', label: 'AED' },
    { code: 'JPY', label: 'JPY' },
    { code: 'CHF', label: 'CHF' },
];

/** Fallback rates (USD base) when the live API is unavailable. */
const FALLBACK_USD_RATES = {
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

const PROVIDERS = [
    {
        name: 'frankfurter.app',
        url: 'https://api.frankfurter.app/latest?from=USD',
        parse: (data) => ({ USD: 1, ...(data?.rates ?? {}) }),
    },
    {
        name: 'exchangerate.host',
        url: 'https://api.exchangerate.host/latest?base=USD',
        parse: (data) => ({ USD: 1, ...(data?.rates ?? {}) }),
    },
    {
        name: 'open.er-api.com',
        url: 'https://open.er-api.com/v6/latest/USD',
        parse: (data) => ({ USD: 1, ...(data?.rates ?? {}) }),
    },
];

const LIVE_RATE_CACHE_MS = 30 * 60 * 1000;
const SUPABASE_RATES_FUNCTION = import.meta.env.VITE_RATES_FUNCTION_NAME ?? 'get-exchange-rates';
const RATE_CACHE_KEY = 'adsroad_exchange_rates_v1';
let cachedRateResult = null;
let cachedRateFetchedAt = 0;
let inflightRateRequest = null;

function readStoredRateResult() {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(RATE_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;

        const timestamp = Number(parsed.timestamp || 0);
        const rates = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : null;
        const live = Boolean(parsed.live);
        const provider = String(parsed.provider || 'fallback');

        if (!rates || !Number.isFinite(timestamp)) return null;

        return { rates, live, provider, timestamp };
    } catch {
        return null;
    }
}

function saveStoredRateResult(result) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({
            ...result,
            timestamp: Date.now(),
        }));
    } catch {
        // Ignore localStorage failures in private mode or low-storage conditions.
    }
}

const storedRateResult = readStoredRateResult();
if (storedRateResult) {
    cachedRateResult = {
        rates: storedRateResult.rates,
        live: storedRateResult.live,
        provider: storedRateResult.provider,
    };
    cachedRateFetchedAt = storedRateResult.timestamp;
}

export function convertUsdToCurrency(amountUsd, currency, rates) {
    const rate = rates[currency] ?? 1;
    return amountUsd * rate;
}

export function formatCheckoutPrice(amountUsd, currency, rates) {
    const value = convertUsdToCurrency(amountUsd, currency, rates);

    if (currency === 'INR') {
        return `₹${value.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    }

    if (currency === 'JPY') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'JPY',
            maximumFractionDigits: 0,
        }).format(Math.round(value));
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function withRequiredCurrencies(rates) {
    const filled = { USD: 1, ...(rates ?? {}) };
    for (const { code } of CHECKOUT_CURRENCIES) {
        if (filled[code] == null) {
            filled[code] = FALLBACK_USD_RATES[code] ?? 1;
        }
    }
    return filled;
}

function hasRequiredLiveRates(rates) {
    const required = ['USD', 'INR', 'EUR', 'GBP'];
    return required.every((code) => Number.isFinite(rates?.[code]) && rates[code] > 0);
}

async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchProviderRates(provider, timeoutMs) {
    const data = await fetchJsonWithTimeout(provider.url, timeoutMs);
    const parsed = provider.parse(data);

    if (!hasRequiredLiveRates(parsed)) {
        throw new Error('Missing required live rates');
    }

    if (!Number.isFinite(parsed.USD) || parsed.USD <= 0) {
        throw new Error('Invalid USD rate');
    }

    return {
        rates: withRequiredCurrencies(parsed),
        live: true,
        provider: provider.name,
    };
}

async function fetchRatesFromSupabaseFunction() {
    const { data, error } = await supabase.functions.invoke(SUPABASE_RATES_FUNCTION, {
        body: {},
    });

    if (error) {
        throw new Error(error.message || 'Unable to fetch exchange rates.');
    }

    if (!data || typeof data !== 'object' || !data.rates) {
        throw new Error('Invalid exchange rate response.');
    }

    return {
        rates: withRequiredCurrencies(data.rates),
        live: Boolean(data.live),
        provider: String(data.provider || 'supabase'),
    };
}

export async function fetchUsdExchangeRates({ timeoutMs = 6000, forceRefresh = false } = {}) {
    if (!forceRefresh && cachedRateResult && (Date.now() - cachedRateFetchedAt) < LIVE_RATE_CACHE_MS) {
        return cachedRateResult;
    }

    if (inflightRateRequest) {
        return inflightRateRequest;
    }

    const request = (async () => {
        try {
            return await fetchRatesFromSupabaseFunction();
        } catch (supabaseError) {
            try {
                return await Promise.any(
                    PROVIDERS.map((provider) => fetchProviderRates(provider, timeoutMs)),
                );
            } catch (browserError) {
                return {
                    rates: withRequiredCurrencies(FALLBACK_USD_RATES),
                    live: false,
                    provider: 'fallback',
                    error: browserError ?? supabaseError,
                };
            }
        }
    })().finally(() => {
        inflightRateRequest = null;
    });

    inflightRateRequest = request;
    const result = await request;

    cachedRateResult = {
        rates: result.rates,
        live: result.live,
        provider: result.provider,
    };
    cachedRateFetchedAt = Date.now();
    saveStoredRateResult(cachedRateResult);

    return result;
}
