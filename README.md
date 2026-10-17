# AdsRoad

Billboard ad game built with **React + Vite**. Payments use **Razorpay Standard Web Checkout**.

## Quick start

```bash
npm install
cp .env.example .env    # add your Razorpay test keys
npm run dev
```

Open http://localhost:3000 → log in → **My Billboards** → **Subscribe**.

## Razorpay integration

| Step | Endpoint | Description |
|------|----------|-------------|
| 1 | `GET/POST /functions/v1/get-exchange-rates` | Returns live USD exchange rates for the checkout UI |
| 2 | `POST /api/create-order` | Creates order via Razorpay API (min 100 paise) |
| 3 | Frontend | Opens `checkout.razorpay.com` modal with `order_id` |
| 4 | `POST /api/verify-payment` | HMAC-SHA256 signature verification |

### Environment variables

**`.env`** (gitignored — never commit):

```env
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=your_secret
VITE_RAZORPAY_KEY_ID=rzp_test_xxxx
```

- `RAZORPAY_KEY_SECRET` is **server-only** (Vite dev API plugin).
- `VITE_RAZORPAY_KEY_ID` is **frontend-only** (Razorpay modal).

Optional: `VITE_RAZORPAY_AMOUNT_PAISE=10000` (₹100), `VITE_RAZORPAY_CURRENCY=INR`.

### Production deploy

`npm run dev` and `npm run preview` serve `/api/*` via the Vite plugin. For static hosting (Netlify, etc.), deploy `supabase/functions` or add serverless routes that mirror `/api/create-order` and `/api/verify-payment`.

For Supabase, deploy all Edge Functions together so the checkout and live currency flow stay in sync:

- `create-razorpay-order`
- `verify-razorpay-payment`
- `get-exchange-rates`

The exchange-rate function is public and used by the checkout UI to refresh pricing in live sessions. If you rename it, update `VITE_RATES_FUNCTION_NAME` in the frontend env.

Production URL: https://www.adsroadindia.com

Github URL: https://abinbinoy7306-cloud.github.io/AdsRoad/

Set the production frontend environment variable:

```env
VITE_SITE_URL=https://www.adsroadindia.com
```

In Supabase Auth URL Configuration, use this exact origin:

```text
Site URL: https://www.adsroadindia.com
Redirect URLs:
https://www.adsroadindia.com/
https://www.adsroadindia.com/?auth=recovery
```

## Test cards

https://razorpay.com/docs/payments/payments/test-card-details/

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | App + Razorpay API on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview build (includes Razorpay API) |
