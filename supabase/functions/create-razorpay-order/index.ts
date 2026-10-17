import {
  createSupabaseAdmin,
  createRazorpayOrder,
  getAuthenticatedUser,
  jsonResponse,
  rejectDisallowedOrigin,
  optionsResponse,
} from '../_shared.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (rejectDisallowedOrigin(origin)) {
    return jsonResponse({ error: 'Origin not allowed.', success: false }, 403, origin);
  }
  if (req.method === 'OPTIONS') return optionsResponse(origin);
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', success: false }, 405, origin);

  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount ?? Deno.env.get('RAZORPAY_AMOUNT_PAISE') ?? 10000);
    const currency = String(body.currency ?? Deno.env.get('RAZORPAY_CURRENCY') ?? 'INR');

    // Razorpay expects `amount` in the smallest currency unit (paise/cents/etc).
    // Since non-INR currencies have different minor-unit scales, keep the validation generic.
    if (!Number.isFinite(amount) || amount < 1) {
      return jsonResponse({ error: 'Amount must be at least 1 minor unit.', success: false }, 400, origin);
    }

    const order = await createRazorpayOrder({
      amount,
      currency,
      receipt: body.receipt ?? `adsroad_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: { user_id: user.id, purpose: body.purpose ?? 'billboard_subscription' },
    });

    const admin = createSupabaseAdmin();
    const { error: paymentInsertError } = await admin
      .from('payments')
      .insert({
        user_id: user.id,
        razorpay_order_id: order.id,
        amount_paise: order.amount,
        currency: order.currency,
        status: 'created',
        purpose: body.purpose ?? 'billboard_subscription',
      });

    if (paymentInsertError) {
      return jsonResponse({
        error: `Failed to persist payment order: ${paymentInsertError.message}`,
        success: false,
      }, 500, origin);
    }

    return jsonResponse({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create order.';
    const status = (error as { statusCode?: number })?.statusCode
      ?? (message.includes('Unauthorized') || message.includes('authorization') ? 401 : 500);
    return jsonResponse({ error: message, success: false }, status, origin);
  }
});
