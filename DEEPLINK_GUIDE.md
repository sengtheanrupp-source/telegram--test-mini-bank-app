# Deeplink / Bank Checkout Implementation Guide

Matches the real spec from `bank-docs-checkout.bill24.io`:

- **Bank API → Generate Payment Links**: `POST /transaction/generatelinks`
- **Bill24 API → Get Transaction Amount (Balance Inquiry)**: `POST /payment/v5/inquiry`
- **Bill24 API → Submit Payment (Confirm Payment)**: `POST /payment/v3/confirm`

## End-to-end flow

```
1. Merchant creates a transaction via the Bill24 SDK
   → gets back a transaction_id (e.g. "ADA90B8B6D89")

2. Merchant's Bank Mobile SDK calls this bank's
   POST /transaction/generatelinks
   { merchant_id, transaction_id, hash }
   → { web_payment_url, mobile_deep_link }

3. SDK opens:
     - web_payment_url on desktop / mobile web
     - mobile_deep_link (Telegram Universal URL) on mobile

4. Telegram Mini App opens with the transaction_id
   (as ?identity_code=... on web, or Telegram's start_param on mobile)
   → automatically calls POST /payment/v5/inquiry
   → shows bill amount + fees, and captures data.urls.return_url

5. User enters payer details, taps "Pay"
   → POST /payment/v3/confirm

6. Success popup → user taps "Done"
   → redirected to return_url (captured in step 4 from the v5 response)
```

## 1. `POST /transaction/generatelinks`

Exposed at the **exact path** `https://<this-app>.vercel.app/transaction/generatelinks`
(no `/api` prefix — see the `rewrites` rule in `vercel.json`, which maps it
to `api/transaction/generatelinks.js`).

**Request**

```json
{
  "merchant_id": "5316",
  "transaction_id": "ADA90B8B6D89",
  "hash": "anything, or omit entirely"
}
```

**Only `merchant_id` and `transaction_id` are validated** — both must be
present, or you get a `400`. `hash` is accepted if you send it but is
**not checked at all** (no presence check, no format check, no
comparison against anything). This was disabled intentionally.

> ⚠️ **Security note:** with hash checking off, this endpoint has no
> request authentication — anyone who can guess or enumerate a
> `transaction_id` can get back a working payment link for it. That's
> fine for staging/testing, but re-enable verification before this goes
> to production. `api/transaction/generatelinks.js` has a commented-out,
> ready-to-paste-back **HASH VERIFICATION (DISABLED)** block at the
> bottom for exactly that — it's the same HMAC-SHA512 check that was
> tested and working, just switched off.

**Response (success)**

```json
{
  "code": "000",
  "message": "Generate Success",
  "data": {
    "web_payment_url": "https://telegram-mini-bank-app.vercel.app/?identity_code=ADA90B8B6D89",
    "mobile_deep_link": "https://t.me/PaymentStagingMini_bot/TestApp?startapp=ADA90B8B6D89"
  }
}
```

`mobile_deep_link` uses the `t.me/...` **Universal URL** format so iOS/
Android intercept it and open Telegram straight into this Mini App
(falling back to Telegram web/App Store install if not installed) — no
custom URL scheme needed.

> Telegram's `startapp` parameter only allows `[A-Za-z0-9_-]`, max 64
> chars. `transaction_id` is sanitized to fit before being used there; if
> your real transaction IDs use other characters, keep them short and
> URL-safe, or ask Bill24 for an alnum transaction ID format.

**Failure responses:** `400` (missing `merchant_id` or `transaction_id`,
or malformed JSON body), `500` (unexpected error).

### Testing it yourself

```bash
curl -X POST https://telegram-mini-bank-app.vercel.app/transaction/generatelinks \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"5316","transaction_id":"ADA90B8B6D89","hash":"unused"}'
```

Or, inside the deployed app itself: **Settings (gear icon) → Manual Test:
Generate Link** → enter Merchant ID + a real staging Transaction ID →
**Simulate Generate Link Call**. This is a **dev tool only** — in
production Bill24's SDK calls `/transaction/generatelinks` directly with
live values, nothing here needs to be configured for that to work.

## 2. Mini App: `POST /payment/v5/inquiry`

Called automatically as soon as the app resolves an `identity_code`
(from the deeplink, or typed manually in the **Pay Bill** view).

**Request** — `Header: token: <AuthToken from Gateway Settings>`

```json
{ "identity_code": "ADA90B8B6D89", "fee_channel": "MERCHANT" }
```

**Response** (already documented in Bill24's docs) returns
`merchant`, `customers[]`, `transaction{ original_amount,
convenience_fee_amount, sponsor_fee_amount, total_amount, currency,
payment_token, ... }`, and — critically — **`urls.return_url`**, which the
app stores and uses for the post-payment "Done" redirect.

## 3. Mini App: `POST /payment/v3/confirm`

Fired when the user taps **Pay Securely** (after PIN/biometric if
enabled). All amount/fee/currency/payment_token fields are taken directly
from the Inquiry response — the amount field in the UI is **read-only** by
design, since `payment_token` is tied to the exact billed amount.

```json
{
  "identity_code": "ADA90B8B6D89",
  "fee_channel": "MERCHANT",
  "bank_ref": "Q7F3K1A9C2E4B6D8",
  "bank_date": "2026-09-03 14:30:33",
  "original_amount": 50000.00,
  "convenience_fee_amount": 800.00,
  "sponsor_fee_amount": 0.00,
  "total_amount": 50800.00,
  "currency": "KHR",
  "description": "",
  "payment_token": "eyJhbGciOi...",
  "payer_account_no": "000111222",
  "payer_account_name": "Chea Samnang",
  "payer_phone": "010123456"
}
```

The **Payer Details** fields (Account No / Name / Phone) were added to
the Pay Bill view specifically for this call.

## 4. The "Pay Bill" menu

- **Home → Pay Bill tile**, and the **bottom nav → Pay Bill tab**, both
  open the same view (`paymentView`).
- When the app is opened from a merchant app via a generated link, it
  auto-navigates to this same view, pre-fills the Identity Code, shows an
  "Opened from merchant app · Transaction …" banner, and immediately runs
  the Inquiry.
- When opened normally (no deeplink), you can paste any staging
  `transaction_id` into the Identity Code field yourself to test the same
  flow manually — this is the same screen either way, since the whole
  flow is keyed off `identity_code`, not a separate customer-code lookup.
- On payment success, the receipt's **Done** button calls
  `handlePaymentDoneAction()`, which redirects to
  `return_url?status=success&identity_code=...&bank_ref=...&amount=...&currency=...`
  (via `Telegram.WebApp.openLink()` + `close()` inside Telegram, or a
  normal `window.location.href` on plain web). If no `return_url` was
  captured (e.g. testing without a real inquiry), it just closes the modal.

## 5. Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Required? | Description |
|---|---|---|
| `WEB_APP_BASE_URL` | Optional | Defaults to `https://telegram-mini-bank-app.vercel.app`. |
| `TELEGRAM_BOT_DEEPLINK` | Optional | Defaults to `https://t.me/PaymentStagingMini_bot/TestApp`. |
| `EXPECTED_MERCHANT_ID` | Optional | If set, rejects any `merchant_id` that doesn't match — the only optional layer of restriction while hash checking is off. |

`BILL24_HASH_TOKEN` is no longer used by the live handler (hash
verification is disabled) — it's only referenced inside the commented-out
restore block in `api/transaction/generatelinks.js` for when you turn
checking back on.

## 6. End-to-end test checklist

1. Deploy to Vercel; set your real **Auth Token** and staging **Base
   Gateway URL** in the app's **API Gateway** settings.
2. In the deployed app: **Settings → Manual Test: Generate Link** →
   Merchant ID (your Prefix Code) + a real Bill24 staging
   `transaction_id` → **Simulate Generate Link Call**.
3. Scan the Mobile Deep Link QR on your phone (or open it directly) →
   Telegram opens this Mini App → the **Pay Bill** view auto-loads with
   the transaction → Inquiry runs automatically and shows the bill.
4. Fill in Payer Details → tap **Pay Securely** → confirm the success
   receipt shows the right amounts.
5. Tap **Done** → confirm you land on the transaction's `return_url` with
   `status=success` and matching `identity_code` / `bank_ref`.
