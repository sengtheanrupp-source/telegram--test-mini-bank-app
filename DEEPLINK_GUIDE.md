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
   → full-screen bank-style loading overlay
   → automatically calls POST /payment/v5/inquiry (as identity_code)
   → captures data.urls.return_url
   → auto-fills payer: account number (generated), account name (Telegram
     user name), phone (generated)
   → NO "Inquiry Successful" modal — lands directly on Confirm screen
     (amount, biller, fee, customer chips + Confirm button)

5. User taps "Confirm"
   → POST /payment/v3/confirm

6. Success popup (payment receipt) → user taps "Done"
   → redirected to return_url (from v5 inquiry response)
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
    "mobile_deep_link": "tg://resolve?domain=PaymentStagingMini_bot&startapp=FCFA48E1A11D&appname=TestApp"
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

`mobile_deep_link` uses the **`tg://resolve` custom URI scheme**, not
`https://t.me/...`. This is deliberate: `tg://` is registered directly
with the OS, so tapping it hands off straight to the Telegram app with no
HTML page in between — it never "routes through a browser page" the way
`https://t.me/...` can (which first loads as a normal web link and only
then redirects into the app). The trade-off: `tg://` only works if
Telegram is already installed — there's no web/App-Store fallback the way
`https://t.me/...` has. For this staging/SDK flow (where Telegram is a
given) that trade-off is intentional. If you ever need the fallback
behavior back, `TELEGRAM_BOT_DEEPLINK` still configures the source
`https://t.me/<bot>/<app>` URL the `tg://` link is derived from — see
`toTelegramSchemeLink()` in `api/transaction/generatelinks.js`.

> ⚠️ **If you get a Vercel `404: DEPLOYMENT_NOT_FOUND` / `Code:
> DEPLOYMENT_NOT_FOUND` page** (not this app's own "not found", but
> Vercel's platform-level error page) — that means `web_payment_url`
> pointed at a domain with **no live deployment behind it at all**. This
> is a hosting/domain configuration issue, not an app bug: set
> `WEB_APP_BASE_URL` to your **actual** production Vercel domain (check
> your Vercel project's Domains tab), redeploy, and confirm the domain
> loads on its own in a browser before generating links against it. Watch
> for typos between similar domains (e.g. `telegram-mini-bank-app` vs
> `telegram-test-mini-bank-app`) — this project has been referenced under
> both names at different points, so double-check which one is actually
> live.

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

Called **immediately** on app open, with no extra tap and no artificial
delay, as soon as the app resolves a `tran_id` from the deeplink. Opening
via a real link skips the manual lookup step entirely — instead of an
Identity Code input + "Run Inquiry" button, the person sees a compact
auto-confirm card (Biller name, Amount + Currency, Transaction ID) that
populates as soon as the inquiry response comes back, plus the Payer
Details fields and a **Pay Securely** button. The manual Identity Code
input + Run Inquiry button only show up when the **Deeplink** view is
opened directly (home tile / bottom nav), for manual testing — see
`applyDeeplinkUiMode()` in `app.js`.

**Request** — `Header: token: <AuthToken from Gateway Settings>`

```json
{ "identity_code": "FCFA48E1A11D", "fee_channel": "MERCHANT" }
```

**Response** returns `merchant`, `customers[]`, `transaction{
original_amount, convenience_fee_amount, sponsor_fee_amount, total_amount,
currency, payment_token, ... }`, and **`urls.return_url`**, which the app
stores and uses for the post-payment "Back to App" redirect. The amount
shown is **read-only** — it's whatever the Inquiry returned, since
`payment_token` is tied to that exact amount.

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

On success, the receipt modal shows a **Back to App** button
(`handlePaymentDoneAction()`), which redirects to the `return_url`
captured from the v5 Inquiry response in step 2, with `status`,
`identity_code`, `bank_ref`, `amount`, `currency` appended. If no
`return_url` was ever captured (e.g. testing manually without a real
inquiry), it just closes the receipt instead.

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
previous Deeplink session, so its "Back to App" button correctly just
closes the receipt instead of trying to redirect anywhere.

## Menu summary

- **Home screen:** Scan QR, Pay Bill, Deeplink, Upload QR, Verify tiles.
- **Bottom nav:** Home, Scan QR, Pay Bill, Deeplink tabs.
- Opening the app via a real merchant-generated deeplink auto-navigates
  straight to the **Deeplink** view's compact confirm card and runs the
  inquiry — the person never sees the home screen or the manual lookup
  form in that case.

## Speed

The startup init now runs on `DOMContentLoaded` instead of full
`window.onload` (all the CDN scripts in `<head>` are blocking, non-async
tags, so they've already executed by then — nothing is lost, it just
stops waiting on images/fonts to finish downloading first). A deeplink
open is detected **before** the home view ever renders, so there's no
home→Deeplink flash — it navigates straight to the Deeplink view and
fires the Inquiry request immediately, with no artificial delay, on both
the web URL and the Telegram mobile deep link.

## Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Required? | Description |
|---|---|---|
| `WEB_APP_BASE_URL` | **Yes, in practice** | Must exactly match your **actual live** Vercel domain. If this is wrong (or the domain has no deployment), `web_payment_url` will 404 at the Vercel platform level — see the ⚠️ note above. Defaults to `https://telegram-mini-bank-app.vercel.app`, which is almost certainly *not* your real domain — set this explicitly. |
| `TELEGRAM_BOT_DEEPLINK` | Optional | The source `https://t.me/<bot>/<app>` URL `mobile_deep_link`'s `tg://resolve` scheme is derived from. Defaults to `https://t.me/PaymentStagingMini_bot/TestApp`. |
| `EXPECTED_MERCHANT_ID` | Optional | If set, rejects any `merchant_id` that doesn't match — the only optional restriction while hash checking is off. |

## End-to-end test checklist

1. Deploy to Vercel; **confirm `WEB_APP_BASE_URL` matches your real
   domain** (load it directly in a browser first — it should NOT show a
   Vercel `DEPLOYMENT_NOT_FOUND` page). Set your real **Auth Token** and
   staging **Base Gateway URL** in the app's **API Gateway** settings.
2. **Bill Pay:** open the Pay Bill tab, enter a known staging customer
   code, Look Up Bill, adjust amount if needed, Pay Securely.
3. **Deeplink:** call `/transaction/generatelinks` with a real staging
   `transaction_id` (via curl or the in-app Manual Test tool). Open the
   returned `web_payment_url` (should load with `?tran_id=...`, straight
   into the compact confirm card, no 404) or tap/scan the `mobile_deep_link`
   on your phone (should jump directly into Telegram, no browser tab).
4. Confirm the compact card shows Biller name, Amount + Currency, and
   Transaction ID correctly as soon as it opens — no extra tap needed.
5. Enter Account Number (required) + Name/Phone, tap **Pay Securely**,
   confirm the success receipt.
6. Tap **Done** → confirm you land on the transaction's `return_url` with
   `status=success` and matching `identity_code` / `bank_ref`.
