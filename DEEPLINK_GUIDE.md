# Deeplink / "Generate Payment Links" Implementation Guide

This adds the missing **Bank API** piece to your existing Telegram Mini App
so a merchant/bank backend can generate a payment session, hand the user a
`web_payment_url` or `mobile_deep_link`, and — once the user finishes
Balance Inquiry + Submit Payment inside the Mini App — get sent back to
`return_url`.

```
Merchant / Bank SDK
   │  POST /api/generate-payment-link  { customer_code, return_url, ... }
   ▼
Bank API (this project's /api routes, deployed on Vercel)
   │  creates a short-lived token, stores order + return_url
   ▼
returns { web_payment_url, mobile_deep_link }
   │
   ├─ Desktop / mobile web → web_payment_url
   │      https://telegram-mini-bank-app.vercel.app/?token=<token>
   │
   └─ Mobile (Telegram)    → mobile_deep_link (Universal URL)
          https://t.me/PaymentStagingMini_bot/TestApp?startapp=<token>
                │
                ▼
   Telegram Mini App opens → GET /api/resolve-link?token=<token>
                │  (pre-fills Customer Code, runs Balance Inquiry
                │   against Bill24 /payment/v4/inquiry automatically)
                ▼
   User reviews balance → taps "Submit Payment"
                │  (Bill24 /payment/v2/confirm — already in app.js)
                ▼
   POST /api/mark-paid  (updates the session so Verify Transaction
                          reflects "paid")
                ▼
   User taps "Done" → redirected to return_url?status=success&ref_no=...
```

## New files

| File | Purpose |
|---|---|
| `api/_store.js` | Shared key/value storage helper (Vercel KV / Upstash REST, with an in-memory fallback for local testing). |
| `api/generate-payment-link.js` | **Bank API → Generate Payment Links.** `POST` — creates a session, returns `web_payment_url` + `mobile_deep_link`. |
| `api/resolve-link.js` | `GET /api/resolve-link?token=` — called by the Mini App itself to fetch the order + `return_url`. |
| `api/mark-paid.js` | `POST` — called by the Mini App after Bill24 Submit Payment succeeds/fails. |
| `api/verify-transaction.js` | **Bank API → Verify Transaction.** `GET ?token=` or `?ref_no=` — poll the session status. |

## Why a token instead of putting everything in the URL

Telegram's Mini App `startapp` deep-link parameter is capped at **64
characters** and only allows `[A-Za-z0-9_-]`. A full order payload
(customer code, amount, currency, ref no, and especially an arbitrary
`return_url`) won't fit. So `generate-payment-link` stores the order
server-side and hands back a short 32-char token; both `web_payment_url`
and `mobile_deep_link` just carry that token, and the Mini App resolves it
via `/api/resolve-link` on load. This also keeps the merchant's
`return_url` out of the shareable link (avoids exposing/tampering).

## 1. Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Required? | Description |
|---|---|---|
| `KV_REST_API_URL` | Recommended | Vercel KV / Upstash Redis REST URL. Without this, sessions are stored in-memory and **will not reliably survive across serverless invocations in production** — fine for local `vercel dev`, not fine for real staging testing. |
| `KV_REST_API_TOKEN` | Recommended | Matching REST token for the KV store above. |
| `WEB_APP_BASE_URL` | Optional | Defaults to `https://telegram-mini-bank-app.vercel.app`. |
| `TELEGRAM_BOT_DEEPLINK` | Optional | Defaults to `https://t.me/PaymentStagingMini_bot/TestApp`. |

To add a free KV store: Vercel dashboard → your project → **Storage** →
**Create Database** → **KV** (backed by Upstash) → connect it to this
project. It auto-populates `KV_REST_API_URL` / `KV_REST_API_TOKEN`.

## 2. Generate a payment link (what the Bank Mobile SDK calls)

```bash
curl -X POST https://telegram-mini-bank-app.vercel.app/api/generate-payment-link \
  -H "Content-Type: application/json" \
  -d '{
    "customer_code": "INV-2026-0009",
    "currency": "USD",
    "return_url": "https://your-bank-app.example.com/payment/callback",
    "expire_minutes": 30
  }'
```

Response:

```json
{
  "code": "SUCCESS",
  "message": "Payment link generated successfully.",
  "data": {
    "token": "5f2a1c9e8b3d4a10c7e2b6f19d0a3c88",
    "ref_no": "BANKM9X1K2A1B2C3",
    "web_payment_url": "https://telegram-mini-bank-app.vercel.app/?token=5f2a1c9e8b3d4a10c7e2b6f19d0a3c88",
    "mobile_deep_link": "https://t.me/PaymentStagingMini_bot/TestApp?startapp=5f2a1c9e8b3d4a10c7e2b6f19d0a3c88",
    "expires_at": "2026-09-03T10:00:00.000Z"
  }
}
```

Your SDK/app then opens `web_payment_url` on web, or `mobile_deep_link` on
mobile — per your existing device-detection logic (point 1 of your
requirements). `mobile_deep_link` uses the `t.me/...` **Universal URL**
format, so iOS/Android intercept it and open the Telegram app straight
into this Mini App (falling back to Telegram web/App Store if Telegram
isn't installed) — no custom URL scheme or app-store intents needed.

### From inside the app itself (no separate backend needed to test)

Open the Mini App → **Settings (gear icon) → Payment Link Generator** →
fill in Customer Code + Return URL → **Generate Payment Link**. It calls
the same `/api/generate-payment-link` endpoint and shows both URLs plus
scannable QR codes.

## 3. What happens inside the Mini App

- On load, `app.js` checks `Telegram.WebApp.initDataUnsafe.start_param`
  (set when opened via `mobile_deep_link`) and the `?token=` query string
  (set when opened via `web_payment_url`).
- If a token is found, it calls `GET /api/resolve-link?token=...`, pre-
  fills the Customer Code field, stores `return_url` in memory, and
  automatically runs **Balance Inquiry** (`/payment/v4/inquiry` against
  `https://staging.bill24.io:22080`, already implemented in `app.js`).
- The user reviews the balance and taps **Submit Payment** (Bill24
  `/payment/v2/confirm`, already implemented).
- On success/failure, the app calls `POST /api/mark-paid` (non-blocking)
  so `verify-transaction` reflects real status.
- The success receipt's **Done** button now calls
  `handlePaymentDoneAction()`, which redirects to
  `return_url?status=success&ref_no=...&txn_id=...&amount=...&currency=...`
  (via `Telegram.WebApp.openLink()` + `close()` inside Telegram, or a
  normal `window.location.href` on plain web).

## 4. Verify a transaction (Bank API side)

```bash
curl "https://telegram-mini-bank-app.vercel.app/api/verify-transaction?ref_no=BANKM9X1K2A1B2C3"
```

```json
{
  "code": "SUCCESS",
  "data": {
    "ref_no": "BANKM9X1K2A1B2C3",
    "status": "paid",
    "txn_id": "Q7F3K1A9C2E4B6D8",
    "paid_amount": 12.5,
    "currency": "USD",
    "updated_at": "2026-09-03T09:41:12.000Z"
  }
}
```

## 5. End-to-end test checklist

1. Deploy this project to Vercel (see `DEPLOYMENT_GUIDE.md`) and set the
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars.
2. In the deployed app, open **Settings → Payment Link Generator**,
   generate a link with your own `return_url` (any URL you can watch, e.g.
   `https://webhook.site/...`).
3. Copy `mobile_deep_link` and open it on your phone (or scan the QR) →
   Telegram opens the Mini App → Balance Inquiry runs automatically.
4. Tap **Submit Payment** → on success, tap **Done** → confirm your
   browser/app lands on `return_url` with `status=success` and the
   `ref_no` you generated.
5. Call `/api/verify-transaction?ref_no=...` and confirm `status: "paid"`.
