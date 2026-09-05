/**
 * POST /api/mark-paid
 * -----------------------------------------------------------------------
 * Called by the Mini App (app.js) right after Bill24's
 * "Submit Payment - (Confirm Payment)" call succeeds or fails, so that the
 * Bank API's "Verify Transaction" endpoint reflects real status.
 *
 * Request JSON body:
 * {
 *   "token": "…",
 *   "status": "paid" | "failed",
 *   "txn_id": "…",
 *   "paid_amount": 12.5,
 *   "currency": "USD"
 * }
 */

const { getValue, setValue } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
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

    const { token, status, txn_id, paid_amount, currency } = body;

    if (!token) {
      return res
        .status(400)
        .json({ code: "INVALID_REQUEST", message: "token is required." });
    }

    const record = await getValue(`link:${token}`);
    if (!record) {
      return res.status(404).json({
        code: "NOT_FOUND",
        message: "Payment link not found or expired.",
      });
    }

    record.status = status === "failed" ? "failed" : "paid";
    record.txn_id = txn_id || record.txn_id || null;
    record.paid_amount =
      paid_amount !== undefined ? paid_amount : record.paid_amount;
    record.currency = currency || record.currency;
    record.updated_at = new Date().toISOString();

    const remainingTtl = Math.floor(
      (new Date(record.expires_at).getTime() - Date.now()) / 1000,
    );
    const ttlSeconds = remainingTtl > 60 ? remainingTtl : 3600; // keep it queryable for a while after payment

    await setValue(`link:${token}`, record, ttlSeconds);
    await setValue(`ref:${record.ref_no}`, { token }, ttlSeconds);

    return res.status(200).json({ code: "SUCCESS", data: record });
  } catch (err) {
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: err.message });
  }
};
