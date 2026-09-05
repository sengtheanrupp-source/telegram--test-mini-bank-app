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

  let body;
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
  } catch (parseErr) {
    // If you see THIS error, the raw bytes on the wire are not valid JSON
    // (e.g. unquoted keys). If your own request logs show unquoted keys
    // but you are NOT seeing this error, that just means your logging
    // tool re-serializes the body for display — the real wire body was
    // fine and this isn't the problem.
    return res.status(400).json({
      code: "400",
      message: "Request body is not valid JSON: " + parseErr.message,
    });
  }

  try {
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

    // HMAC-SHA512 always produces a 64-byte digest, which Base64-encodes
    // (with padding) to EXACTLY 88 characters. Checking this up front lets
    // us tell you precisely when the hash itself is malformed/truncated,
    // instead of a generic "Invalid hash" that looks identical to a
    // wrong-secret error.
    const hashStr = String(hash);
    let decodedLength = -1;
    try {
      decodedLength = Buffer.from(hashStr, "base64").length;
    } catch (e) {
      decodedLength = -1;
    }

    if (hashStr.length !== 88 || decodedLength !== 64) {
      return res.status(400).json({
        code: "400",
        message:
          `hash is not a valid Base64(HMAC-SHA512) value. ` +
          `Expected 88 base64 characters decoding to 64 bytes, ` +
          `but received ${hashStr.length} characters decoding to ${decodedLength} bytes. ` +
          `This is a malformed/truncated hash on the caller's side (check the ` +
          `HMAC-SHA512 + Base64 implementation used to sign the request) — it ` +
          `will always fail hash comparison, regardless of which secret was used.`,
      });
    }

    const expectedHash = computeHash(merchant_id, transaction_id, HASH_TOKEN);

    const providedBuf = Buffer.from(hashStr, "base64");
    const expectedBuf = Buffer.from(expectedHash, "base64");
    const isValid =
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf);

    if (!isValid) {
      return res.status(401).json({
        code: "401",
        message:
          "Invalid hash. The hash is well-formed (88 chars / 64 bytes) but " +
          "doesn't match merchant_id + transaction_id signed with this " +
          "server's BILL24_HASH_TOKEN. Confirm both sides are using the " +
          "exact same shared secret (no extra whitespace/newline).",
      });
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
