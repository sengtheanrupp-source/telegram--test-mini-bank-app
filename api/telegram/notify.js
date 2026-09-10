module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const botToken = body.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const chatId = body.chatId || process.env.TELEGRAM_CHANNEL_ID || "";
    const text = body.text || "";
    if (!botToken || !chatId || !text) {
      res.status(400).json({ ok: false, error: "botToken, chatId and text required" });
      return;
    }
    const tgRes = await fetch(
      "https://api.telegram.org/bot" + botToken + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(text).slice(0, 4000),
          disable_web_page_preview: true,
        }),
      },
    );
    const data = await tgRes.json();
    res.status(tgRes.ok ? 200 : 502).json({ ok: !!data.ok, result: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "notify failed" });
  }
};
