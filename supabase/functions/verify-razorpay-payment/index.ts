import {
  createSupabaseAdmin,
  getAuthenticatedUser,
  jsonResponse,
  rejectDisallowedOrigin,
  optionsResponse,
  verifyPaymentSignature,
} from '../_shared.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (rejectDisallowedOrigin(origin)) {
    return jsonResponse({ error: 'Origin not allowed.', success: false }, 403, origin);
  }
  if (req.method === 'OPTIONS') return optionsResponse(origin);
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);

  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;

    if (!orderId || !paymentId || !signature) {
      return jsonResponse({ error: 'Missing payment verification fields.' }, 400, origin);
    }

    if (!(await verifyPaymentSignature(orderId, paymentId, signature))) {
      return jsonResponse({ success: false, error: 'Invalid payment signature.' }, 400, origin);
    }

    const admin = createSupabaseAdmin();
    const { data: paymentRow, error: fetchError } = await admin
      .from('payments')
      .select('id, user_id')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();

    if (fetchError) console.error('payments lookup failed:', fetchError.message);

    if (!paymentRow) {
      return jsonResponse({ verified: false, error: 'Order not found or not tracked.' }, 404, origin);
    }

    if (paymentRow && paymentRow.user_id !== user.id) {
      return jsonResponse({ verified: false, error: 'Payment does not belong to this user.' }, 403, origin);
    }

    const { error: updateError } = await admin
      .from('payments')
      .update({
        razorpay_payment_id: paymentId,
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', paymentRow.id);

    if (updateError) console.error('payments update failed:', updateError.message);

    return jsonResponse({ success: true, order_id: orderId, payment_id: paymentId }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment verification failed.';
    return jsonResponse({ success: false, error: message }, 400, origin);
  }
});
