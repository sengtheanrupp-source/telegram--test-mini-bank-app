/**
 * POST /transaction/generatelinks
 * (exposed at this exact path via vercel.json rewrite -> this file)
 * -----------------------------------------------------------------------
 * Called by Bill24 / the merchant with a transaction that was already
 * created via the Bill24 SDK. Hands back the two URLs that open this
 * Mini App for that transaction.
 *
 * Request JSON body:
 * {
 *   "merchant_id": "5316",              // Prefix Code — required
 *   "transaction_id": "ADA90B8B6D89",    // Transaction ID from the Bill24 SDK — required
 *   "hash": "850bfc3e2ba66bfeaf2c397eaeffa9ffd05e1fca"  // accepted if sent, NOT checked
 * }
 *
 * Only merchant_id and transaction_id are validated (must be present).
 * hash is not required and its value is never checked/verified — no
 * length check, no HMAC comparison, nothing. This endpoint currently has
 * NO request authentication. Anyone who can guess/enumerate a
 * transaction_id can get back a working payment link for it. Re-enable
 * hash verification before going to production — see HASH VERIFICATION
 * (DISABLED) below for a drop-in version you can restore.
 *
 * Response JSON body (success):
 * {
 *   "code": "000",
 *   "message": "Generate Success",
 *   "data": {
 *     "web_payment_url": "https://telegram-mini-bank-app.vercel.app/?identity_code=ADA90B8B6D89",
 *     "mobile_deep_link": "https://t.me/PaymentStagingMini_bot/TestApp?startapp=ADA90B8B6D89"
 *   }
 * }
 */

const WEB_APP_BASE_URL = (
  process.env.WEB_APP_BASE_URL || "https://telegram-mini-bank-app.vercel.app"
).replace(/\/$/, "");

const TELEGRAM_BOT_DEEPLINK =
  process.env.TELEGRAM_BOT_DEEPLINK ||
  "https://t.me/PaymentStagingMini_bot/TestApp";

// Optional: lock the endpoint to one known merchant_id. Leave unset to
// accept any merchant_id.
const EXPECTED_MERCHANT_ID = process.env.EXPECTED_MERCHANT_ID || "";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Telegram's startapp param only allows [A-Za-z0-9_-], max 64 chars.
function toTelegramSafeParam(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.slice(0, 64);
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ code: "405", message: "Use POST." });
  }

  let body;
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
  } catch (parseErr) {
    return res.status(400).json({
      code: "400",
      message: "Request body is not valid JSON: " + parseErr.message,
    });
  }

  try {
    const { merchant_id, transaction_id, hash } = body;

    // Only merchant_id and transaction_id are required. hash is accepted
    // if sent, but is not checked for presence or validity.
    if (!merchant_id || !transaction_id) {
      return res.status(400).json({
        code: "400",
        message: "merchant_id and transaction_id are required.",
      });
    }

    if (EXPECTED_MERCHANT_ID && String(merchant_id) !== EXPECTED_MERCHANT_ID) {
      return res.status(401).json({ code: "401", message: "Unknown merchant_id." });
    }

    const safeParam = toTelegramSafeParam(transaction_id);
    const webPaymentUrl = `${WEB_APP_BASE_URL}/?identity_code=${encodeURIComponent(transaction_id)}`;
    const mobileDeepLink = `${TELEGRAM_BOT_DEEPLINK}?startapp=${safeParam}`;

    return res.status(200).json({
      code: "000",
      message: "Generate Success",
      data: {
        web_payment_url: webPaymentUrl,
        mobile_deep_link: mobileDeepLink,
      },
    });
  } catch (err) {
    return res.status(500).json({ code: "500", message: err.message });
  }
};

/* -------------------------------------------------------------------------
 * HASH VERIFICATION (DISABLED) — reference implementation.
 * Hash checking is currently OFF per request (only merchant_id and
 * transaction_id are validated above). To turn it back on:
 *
 *   1. `const crypto = require("crypto");` at the top of this file.
 *   2. Set the BILL24_HASH_TOKEN env var to the real shared secret.
 *   3. Paste this block back into the try{} above, right after the
 *      merchant_id/transaction_id presence check.
 *
 * const HASH_TOKEN = process.env.BILL24_HASH_TOKEN || "";
 *
 * function computeHash(merchantId, transactionId, hashToken) {
 *   return crypto
 *     .createHmac("sha512", hashToken)
 *     .update(`${merchantId}${transactionId}`)
 *     .digest("base64");
 * }
 *
 * if (!hash) {
 *   return res.status(400).json({ code: "400", message: "hash is required." });
 * }
 *
 * const hashStr = String(hash);
 * const decodedLength = Buffer.from(hashStr, "base64").length;
 * if (hashStr.length !== 88 || decodedLength !== 64) {
 *   return res.status(400).json({
 *     code: "400",
 *     message: `hash is not a valid Base64(HMAC-SHA512) value. Expected 88 ` +
 *       `base64 characters decoding to 64 bytes, but received ` +
 *       `${hashStr.length} characters decoding to ${decodedLength} bytes.`,
 *   });
 * }
 *
 * const expectedHash = computeHash(merchant_id, transaction_id, HASH_TOKEN);
 * const providedBuf = Buffer.from(hashStr, "base64");
 * const expectedBuf = Buffer.from(expectedHash, "base64");
 * const isValid =
 *   providedBuf.length === expectedBuf.length &&
 *   crypto.timingSafeEqual(providedBuf, expectedBuf);
 * if (!isValid) {
 *   return res.status(401).json({ code: "401", message: "Invalid hash." });
 * }
 * ---------------------------------------------------------------------- */
