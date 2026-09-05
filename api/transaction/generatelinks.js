/**
 * POST /transaction/generatelinks
 * (exposed at this exact path via vercel.json rewrite -> this file)
 * -----------------------------------------------------------------------
 * Called by Bill24 / the merchant with a transaction that was already
 * created via the Bill24 SDK. We just need to authenticate the call and
 * hand back the two URLs that open this Mini App for that transaction.
 *
 * Request JSON body:
 * {
 *   "merchant_id": "5316",              // Prefix Code from Gateway Settings
 *   "transaction_id": "ADA90B8B6D89",    // Transaction ID from the Bill24 SDK
 *   "hash": "850bfc3e2ba66bfeaf2c397eaeffa9ffd05e1fca"
 * }
 *
 * hash = Base64( HMAC_SHA512( merchant_id + transaction_id, hash_token ) )
 * hash_token is the shared secret Bill24 provides to the partnered bank,
 * configured here as the BILL24_HASH_TOKEN environment variable.
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

const crypto = require("crypto");

const WEB_APP_BASE_URL = (
  process.env.WEB_APP_BASE_URL || "https://telegram-mini-bank-app.vercel.app"
).replace(/\/$/, "");

const TELEGRAM_BOT_DEEPLINK =
  process.env.TELEGRAM_BOT_DEEPLINK ||
  "https://t.me/PaymentStagingMini_bot/TestApp";

// Fallback lets you test locally without setting an env var first — the
// gateway settings default "Prefix Code" (5316) pairs with this. CHANGE /
// remove the fallback and always set BILL24_HASH_TOKEN in real deployments.
const HASH_TOKEN = process.env.BILL24_HASH_TOKEN || "staging-hash-token-change-me";

// Optional: lock the endpoint to one known merchant_id. Leave unset to
// accept any merchant_id as long as the hash checks out.
const EXPECTED_MERCHANT_ID = process.env.EXPECTED_MERCHANT_ID || "";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function computeHash(merchantId, transactionId, hashToken) {
  return crypto
    .createHmac("sha512", hashToken)
    .update(`${merchantId}${transactionId}`)
    .digest("base64");
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

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const { merchant_id, transaction_id, hash } = body;

    if (!merchant_id || !transaction_id || !hash) {
      return res.status(400).json({
        code: "400",
        message: "merchant_id, transaction_id and hash are all required.",
      });
    }

    if (EXPECTED_MERCHANT_ID && String(merchant_id) !== EXPECTED_MERCHANT_ID) {
      return res.status(401).json({ code: "401", message: "Unknown merchant_id." });
    }

    const expectedHash = computeHash(merchant_id, transaction_id, HASH_TOKEN);

    const providedBuf = Buffer.from(String(hash));
    const expectedBuf = Buffer.from(expectedHash);
    const isValid =
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf);

    if (!isValid) {
      return res.status(401).json({ code: "401", message: "Invalid hash." });
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
