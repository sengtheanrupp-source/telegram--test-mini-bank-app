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
  "hash": "Base64(HMAC_SHA512(merchant_id + transaction_id, hash_token))"
}
```

`hash_token` is the shared secret Bill24 gives your bank. Configure it as
the `BILL24_HASH_TOKEN` environment variable in Vercel — **do not** ship
the local fallback default (`staging-hash-token-change-me`) to production.

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

**Failure responses:** `400` (missing fields), `401` (bad `hash` or
unknown `merchant_id` if `EXPECTED_MERCHANT_ID` is set), `500`.

### Testing it yourself

```bash
# Example: compute the hash and call the endpoint
node -e '
  const crypto = require("crypto");
  const merchant_id = "5316";
  const transaction_id = "ADA90B8B6D89";
  const hash_token = "staging-hash-token-change-me"; // must match BILL24_HASH_TOKEN
  const hash = crypto.createHmac("sha512", hash_token)
    .update(merchant_id + transaction_id).digest("base64");
  console.log(JSON.stringify({ merchant_id, transaction_id, hash }));
' > /tmp/payload.json

curl -X POST https://telegram-mini-bank-app.vercel.app/transaction/generatelinks \
  -H "Content-Type: application/json" \
  -d @/tmp/payload.json
```

Or, inside the deployed app itself: **Settings (gear icon) → Payment Link
Generator** → enter Merchant ID + a real staging Transaction ID → the app
computes the HMAC-SHA512 hash in-browser (Web Crypto) using the **Bill24
Hash Token** you set in **API Gateway** settings, calls the real endpoint,
and shows both URLs + scannable QR codes.

## 2. Mini App: `POST /payment/v5/inquiry`

Called automatically as soon as the app resolves an `identity_code`
(from the deeplink, or typed manually in the **Deeplink** view).

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

The new **Payer Details** fields (Account No / Name / Phone) were added to
the Deeplink view specifically for this call.

## 4. The "Deeplink" menu

- **Home → Deeplink tile**, and the **bottom nav → Deeplink tab**, both
  open the same view (`paymentView`, headed "Deeplink Checkout").
- When the app is opened from a merchant app via a generated link, it
  auto-navigates to this same view, pre-fills the Identity Code, shows a
  "Opened from merchant app · Transaction …" banner, and immediately runs
  the Inquiry.
- When opened normally (no deeplink), you can paste any staging
  `transaction_id` into the Identity Code field yourself to test the same
  flow manually.
- On payment success, the receipt's **Done** button calls
  `handlePaymentDoneAction()`, which redirects to
  `return_url?status=success&identity_code=...&bank_ref=...&amount=...&currency=...`
  (via `Telegram.WebApp.openLink()` + `close()` inside Telegram, or a
  normal `window.location.href` on plain web). If no `return_url` was
  captured (e.g. testing without a real inquiry), it just closes the modal.

## 5. Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Required? | Description |
|---|---|---|
| `BILL24_HASH_TOKEN` | **Yes** | Shared secret used to verify the `hash` on incoming `/transaction/generatelinks` calls. |
| `EXPECTED_MERCHANT_ID` | Optional | If set, rejects any `merchant_id` that doesn't match. |
| `WEB_APP_BASE_URL` | Optional | Defaults to `https://telegram-mini-bank-app.vercel.app`. |
| `TELEGRAM_BOT_DEEPLINK` | Optional | Defaults to `https://t.me/PaymentStagingMini_bot/TestApp`. |

## 6. End-to-end test checklist

1. Deploy to Vercel; set `BILL24_HASH_TOKEN` to the real value Bill24 gave
   you (and put the same value in the app's **API Gateway → Bill24 Hash
   Token** setting, plus your real **Auth Token** and staging **Base
   Gateway URL**).
2. In the deployed app: **Settings → Payment Link Generator** → Merchant
   ID (your Prefix Code) + a real Bill24 staging `transaction_id` →
   **Generate Payment Link**.
3. Scan the Mobile Deep Link QR on your phone (or open it directly) →
   Telegram opens this Mini App → the **Deeplink** view auto-loads with
   the transaction → Inquiry runs automatically and shows the bill.
4. Fill in Payer Details → tap **Pay Securely** → confirm the success
   receipt shows the right amounts.
5. Tap **Done** → confirm you land on the transaction's `return_url` with
   `status=success` and matching `identity_code` / `bank_ref`.
