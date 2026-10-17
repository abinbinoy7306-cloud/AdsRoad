import {
  fetchUsdExchangeRates,
  jsonResponse,
  optionsResponse,
} from '../_shared.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req.headers.get('Origin'));
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.', success: false }, 405, req.headers.get('Origin'));
  }

  try {
    const result = await fetchUsdExchangeRates();
    return jsonResponse({
      rates: result.rates,
      live: result.live,
      provider: result.provider,
    }, 200, req.headers.get('Origin'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch exchange rates.';
    return jsonResponse({
      error: message,
      success: false,
      rates: null,
    }, 500, req.headers.get('Origin'));
  }
});
