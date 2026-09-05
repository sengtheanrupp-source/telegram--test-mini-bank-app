/**
 * GET /api/verify-transaction?token=xxxxx
 * GET /api/verify-transaction?ref_no=xxxxx
 * -----------------------------------------------------------------------
 * "Bank API -> Verify Transaction"
 *
 * Lets the merchant / bank backend poll the status of a payment session
 * created via /api/generate-payment-link, either by the opaque token or
 * by the bank's own ref_no.
 */

const { getValue } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ code: "METHOD_NOT_ALLOWED", message: "Use GET." });
  }

  const { token, ref_no } = req.query || {};

  try {
    let record = null;

    if (token) {
      record = await getValue(`link:${token}`);
    } else if (ref_no) {
      const refEntry = await getValue(`ref:${ref_no}`);
      if (refEntry && refEntry.token) {
        record = await getValue(`link:${refEntry.token}`);
      }
    } else {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "token or ref_no is required.",
      });
    }

    if (!record) {
      return res
        .status(404)
        .json({ code: "NOT_FOUND", message: "Transaction not found." });
    }

    const isExpired =
      record.status === "pending" &&
      record.expires_at &&
      new Date(record.expires_at).getTime() < Date.now();

    return res.status(200).json({
      code: "SUCCESS",
      data: {
        ref_no: record.ref_no,
        status: isExpired ? "expired" : record.status,
        txn_id: record.txn_id || null,
        paid_amount: record.paid_amount ?? null,
        currency: record.currency,
        updated_at: record.updated_at || record.created_at,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: err.message });
  }
};
