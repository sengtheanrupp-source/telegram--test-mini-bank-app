/**
 * POST /api/generate-payment-link
 * -----------------------------------------------------------------------
 * "Bank API -> Generate Payment Links"
 *
 * Called by the merchant / bank backend (or the in-app "Test Link
 * Generator" panel) to create a payment session and get back the two
 * links the Bank Mobile SDK opens on click:
 *
 *   - web_payment_url   -> opened on desktop / mobile web
 *   - mobile_deep_link  -> opened on mobile via the Telegram universal
 *                          link (t.me/<bot>/<app>?startapp=<token>), which
 *                          launches the Telegram Mini App directly (or
 *                          falls back to Telegram web/install prompt if
 *                          the app isn't installed) — this IS the
 *                          "Universal URL" behavior.
 *
 * Request JSON body:
 * {
 *   "customer_code": "INV-2026-0009",      // required — Bill24 consumer/bill code
 *   "bill_code": "INV-2026-0009",          // optional, defaults to customer_code
 *   "amount": 12.5,                          // optional, informational only
 *   "currency": "USD",                       // optional, defaults to USD
 *   "ref_no": "BANKTXN20260902001",        // optional, auto-generated if omitted
 *   "return_url": "https://bank-app.example.com/callback", // required
 *   "expire_minutes": 30                     // optional, defaults to 30
 * }
 *
 * Response JSON body:
 * {
 *   "code": "SUCCESS",
 *   "message": "Payment link generated successfully.",
 *   "data": {
 *     "token": "…",
 *     "ref_no": "…",
 *     "web_payment_url": "https://telegram-mini-bank-app.vercel.app/?token=…",
 *     "mobile_deep_link": "https://t.me/PaymentStagingMini_bot/TestApp?startapp=…",
 *     "expires_at": "2026-09-02T09:30:00.000Z"
 *   }
 * }
 */

const crypto = require("crypto");
const { setValue } = require("./_store");

const WEB_APP_BASE_URL = (
  process.env.WEB_APP_BASE_URL || "https://telegram-mini-bank-app.vercel.app"
).replace(/\/$/, "");

const TELEGRAM_BOT_DEEPLINK =
  process.env.TELEGRAM_BOT_DEEPLINK ||
  "https://t.me/PaymentStagingMini_bot/TestApp";

const DEFAULT_EXPIRE_MINUTES = 30;

function generateToken() {
  // 32 hex chars: well under Telegram's 64-char startapp limit and only
  // uses [0-9a-f], which satisfies Telegram's [A-Za-z0-9_-] requirement.
  return crypto.randomBytes(16).toString("hex");
}

function generateRefNo() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `BANK${stamp}${rand}`;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ code: "METHOD_NOT_ALLOWED", message: "Use POST." });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const {
      customer_code,
      bill_code,
      amount,
      currency,
      ref_no,
      return_url,
      expire_minutes,
    } = body;

    if (!customer_code || !String(customer_code).trim()) {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "customer_code is required.",
      });
    }
    if (!return_url || !/^https?:\/\/.+/i.test(String(return_url))) {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "return_url is required and must be a valid http(s) URL.",
      });
    }

    const token = generateToken();
    const finalRefNo = (ref_no && String(ref_no).trim()) || generateRefNo();
    const expireMinutes =
      Number(expire_minutes) > 0
        ? Number(expire_minutes)
        : DEFAULT_EXPIRE_MINUTES;
    const nowMs = Date.now();
    const expiresAt = new Date(nowMs + expireMinutes * 60 * 1000).toISOString();

    const record = {
      token,
      customer_code: String(customer_code).trim(),
      bill_code: (bill_code && String(bill_code).trim()) || String(customer_code).trim(),
      amount: amount !== undefined && amount !== null && amount !== "" ? Number(amount) : null,
      currency: currency || "USD",
      ref_no: finalRefNo,
      return_url: String(return_url),
      status: "pending", // pending -> paid | failed | expired
      created_at: new Date(nowMs).toISOString(),
      expires_at: expiresAt,
    };

    const ttlSeconds = expireMinutes * 60;
    await setValue(`link:${token}`, record, ttlSeconds);
    await setValue(`ref:${finalRefNo}`, { token }, ttlSeconds);

    const webPaymentUrl = `${WEB_APP_BASE_URL}/?token=${token}`;
    const mobileDeepLink = `${TELEGRAM_BOT_DEEPLINK}?startapp=${token}`;

    return res.status(200).json({
      code: "SUCCESS",
      message: "Payment link generated successfully.",
      data: {
        token,
        ref_no: finalRefNo,
        web_payment_url: webPaymentUrl,
        mobile_deep_link: mobileDeepLink,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: err.message });
  }
};
