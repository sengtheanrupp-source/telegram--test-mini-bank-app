# Deeplink / Bank Checkout Implementation Guide

This app has **two separate, independent payment menus**:

| Menu | Endpoints | Key field | When to use |
|---|---|---|---|
| **Pay Bill** | `POST /payment/v4/inquiry`, `POST /payment/v2/confirm` | `customer_code` | Manual bill lookup (teller enters a customer/invoice code directly) |
| **Deeplink** | `POST /payment/v5/inquiry`, `POST /payment/v3/confirm` | `identity_code` | Opened from a merchant app via `/transaction/generatelinks` — the Bill24 SDK checkout flow |

They're fully separate views, state, and DOM elements — nothing shared
except the success/receipt modal UI and connection settings (Base URL,
Auth Token).

## The Deeplink flow (Bank Checkout / Deeplink)

```
1. Merchant creates a transaction via the Bill24 SDK
   → gets back a transaction_id (e.g. "FCFA48E1A11D")

2. Merchant's Bank Mobile SDK calls this bank's
   POST /transaction/generatelinks
   { merchant_id, transaction_id, hash }
   → { web_payment_url, mobile_deep_link }

3. SDK opens:
     - web_payment_url on desktop / mobile web
     - mobile_deep_link (Telegram Universal URL) on mobile

4. Telegram Mini App opens with the transaction_id
   (as ?tran_id=... on web, or Telegram's start_param on mobile)
   → automatically calls POST /payment/v5/inquiry (as identity_code)
   → shows bill amount + fees, and captures data.urls.return_url

5. User enters payer account number + confirms, taps "Pay"
   → POST /payment/v3/confirm

6. Success popup → user taps "Done"
   → redirected to return_url (captured in step 4 from the v5 response)
```

### 1. `POST /transaction/generatelinks`

Exposed at the **exact path** `https://<this-app>.vercel.app/transaction/generatelinks`
(no `/api` prefix — see the `rewrites` rule in `vercel.json`, which maps it
to `api/transaction/generatelinks.js`).

**Request**

```json
{
  "merchant_id": "8282",
  "transaction_id": "FCFA48E1A11D",
  "hash": "anything, or omit entirely"
}
```

**Only `merchant_id` and `transaction_id` are validated** — both must be
present, or you get a `400`. `hash` is accepted if sent but is **not
checked at all**.

> ⚠️ **Security note:** with hash checking off, this endpoint has no
> request authentication. Fine for staging, but re-enable it before
> production — `api/transaction/generatelinks.js` has a commented-out,
> ready-to-paste-back HMAC-SHA512 verification block at the bottom.

**Response (success)**

```json
{
  "code": "000",
  "message": "Generate Success",
  "data": {
    "web_payment_url": "https://telegram-mini-bank-app.vercel.app/?tran_id=FCFA48E1A11D",
    "mobile_deep_link": "https://t.me/PaymentStagingMini_bot/TestApp?startapp=FCFA48E1A11D"
  }
}
```

**Important:** the web URL's query parameter is `tran_id` (this is what
Bill24's SDK expects — using `identity_code` here caused a 404 when
opened from the SDK, even though the URL worked fine typed directly into
a browser). This is purely a **URL parameter name** — internally, when
the Mini App calls Bill24's own `/payment/v5/inquiry`, the field sent in
that request body is still `identity_code`, unchanged, matching Bill24's
own inquiry spec. Only the outer link's query key changed.

The Mini App's deeplink parser accepts `tran_id` (primary), and
`identity_code` / `token` / `startapp` as fallbacks, so old test links
still work.

`mobile_deep_link` uses the `t.me/...` **Universal URL** format so iOS/
Android intercept it and open Telegram straight into this Mini App.
Telegram's `startapp` value has no query-key name (it's positional), so
it's unaffected by the `tran_id` change — it just carries the raw
`transaction_id`, sanitized to `[A-Za-z0-9_-]`, max 64 chars.

### Testing it yourself

```bash
curl -X POST https://telegram-mini-bank-app.vercel.app/transaction/generatelinks \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"8282","transaction_id":"FCFA48E1A11D"}'
```

Or, inside the deployed app: **Settings → Manual Test: Generate Link**
(dev tool only — Bill24's SDK calls the real endpoint directly in
production, nothing here needs configuring for that).

### 2. Mini App: `POST /payment/v5/inquiry`

Called automatically as soon as the app resolves a `tran_id` (from the
deeplink), or when the user taps **Run Inquiry** in the **Deeplink** view
after typing a transaction ID manually.

**Request** — `Header: token: <AuthToken from Gateway Settings>`

```json
{ "identity_code": "FCFA48E1A11D", "fee_channel": "MERCHANT" }
```

**Response** returns `merchant`, `customers[]`, `transaction{
original_amount, convenience_fee_amount, sponsor_fee_amount, total_amount,
currency, payment_token, ... }`, and **`urls.return_url`**, which the app
stores and uses for the post-payment "Done" redirect. The amount shown is
**read-only** — it's whatever the Inquiry returned, since `payment_token`
is tied to that exact amount.

### 3. Mini App: `POST /payment/v3/confirm`

Fired when the user fills in **Account Number** (required — this is the
payer's account number) plus Account Name / Phone, then taps **Pay
Securely**.

```json
{
  "identity_code": "FCFA48E1A11D",
  "fee_channel": "MERCHANT",
  "bank_ref": "Q7F3K1A9C2E4B6D8",
  "bank_date": "2026-09-06 14:30:33",
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

## The Bill Pay flow (manual, customer_code based)

Independent of the deeplink flow above. Reachable via the **Pay Bill**
home tile / bottom-nav tab. The teller types a customer code directly
(combined with the "Prefix Code" from Gateway Settings, e.g.
`5316` + `INV-2026-0009`), taps **Look Up Bill**, and the amount field is
**editable** (unlike Deeplink) since this flow supports adjusting the
paid amount.

```
POST /payment/v4/inquiry   { "customer_code": "5316INV-2026-0009" }
POST /payment/v2/confirm   { customer_code, bill_code, bill_amount,
                              total_amount, currency, payment_token, ref_no }
```

Starting a Bill Pay inquiry clears any leftover `return_url` from a
previous Deeplink session, so its "Done" button correctly just closes the
receipt instead of trying to redirect anywhere.

## Menu summary

- **Home screen:** Scan QR, Pay Bill, Deeplink, Upload QR, Verify tiles.
- **Bottom nav:** Home, Scan QR, Pay Bill, Deeplink tabs.
- Opening the app via a real merchant-generated deeplink auto-navigates
  straight to the **Deeplink** view and runs the inquiry — the person
  never needs to find the menu themselves in that case.

## Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Required? | Description |
|---|---|---|
| `WEB_APP_BASE_URL` | Optional | Defaults to `https://telegram-mini-bank-app.vercel.app`. |
| `TELEGRAM_BOT_DEEPLINK` | Optional | Defaults to `https://t.me/PaymentStagingMini_bot/TestApp`. |
| `EXPECTED_MERCHANT_ID` | Optional | If set, rejects any `merchant_id` that doesn't match — the only optional restriction while hash checking is off. |

## End-to-end test checklist

1. Deploy to Vercel; set your real **Auth Token** and staging **Base
   Gateway URL** in the app's **API Gateway** settings.
2. **Bill Pay:** open the Pay Bill tab, enter a known staging customer
   code, Look Up Bill, adjust amount if needed, Pay Securely.
3. **Deeplink:** call `/transaction/generatelinks` with a real staging
   `transaction_id` (via curl or the in-app Manual Test tool). Open the
   returned `web_payment_url` (should load with `?tran_id=...` and no
   404) or scan the `mobile_deep_link` QR on your phone.
4. Confirm the Deeplink view auto-loads with the transaction, Inquiry
   runs automatically, and the bill amount/fees display correctly.
5. Enter Account Number (required) + Name/Phone, tap **Pay Securely**,
   confirm the success receipt.
6. Tap **Done** → confirm you land on the transaction's `return_url` with
   `status=success` and matching `identity_code` / `bank_ref`.
