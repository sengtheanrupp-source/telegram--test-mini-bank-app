/**
 * GET /api/resolve-link?token=xxxxx
 * -----------------------------------------------------------------------
 * Called by the Mini App itself (app.js) right after it opens from either
 * the web_payment_url (?token=...) or the Telegram mobile_deep_link
 * (startapp=... -> Telegram.WebApp.initDataUnsafe.start_param).
 *
 * Resolves the opaque token back into the order details that were saved
 * by /api/generate-payment-link, including the merchant's return_url.
 */

const { getValue } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ code: "METHOD_NOT_ALLOWED", message: "Use GET." });
  }

  const token = (req.query && req.query.token) || "";
  if (!token) {
    return res
      .status(400)
      .json({ code: "INVALID_REQUEST", message: "token is required." });
  }

  try {
    const record = await getValue(`link:${token}`);

    if (!record) {
      return res.status(404).json({
        code: "NOT_FOUND",
        message: "Payment link not found or expired.",
      });
    }

    if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(410).json({
        code: "EXPIRED",
        message: "This payment link has expired.",
      });
    }

    return res.status(200).json({ code: "SUCCESS", data: record });
  } catch (err) {
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: err.message });
  }
};
