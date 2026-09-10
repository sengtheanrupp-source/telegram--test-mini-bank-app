/**
 * Telegram Bot API proxy — keeps Mini App in-app (no CORS issues).
 * POST body: { botToken, chatId, text?, action?, messageId?, mediaBase64?, mediaType?, filename? }
 * action: sendMessage | sendPhoto | sendVoice | deleteMessage
 */
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
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const botToken = (body.botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = (body.chatId || "").trim();
    const action = (body.action || "sendMessage").trim();
    const text = body.text != null ? String(body.text) : "";

    if (!botToken) {
      res.status(400).json({ ok: false, error: "botToken required" });
      return;
    }
    if (!chatId && action !== "getMe") {
      res.status(400).json({ ok: false, error: "chatId required" });
      return;
    }

    const api = "https://api.telegram.org/bot" + botToken;

    if (action === "deleteMessage") {
      const messageId = body.messageId;
      if (!messageId) {
        res.status(400).json({ ok: false, error: "messageId required" });
        return;
      }
      const tgRes = await fetch(api + "/deleteMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      });
      const data = await tgRes.json();
      res.status(data.ok ? 200 : 502).json({ ok: !!data.ok, result: data });
      return;
    }

    if (action === "sendPhoto" || action === "sendVoice" || action === "sendVideo") {
      const mediaBase64 = body.mediaBase64 || "";
      if (!mediaBase64) {
        res.status(400).json({ ok: false, error: "mediaBase64 required" });
        return;
      }
      // data URL or raw base64
      let b64 = mediaBase64;
      let mime = "application/octet-stream";
      const m = /^data:([^;]+);base64,(.+)$/s.exec(mediaBase64);
      if (m) {
        mime = m[1];
        b64 = m[2];
      }
      const bin = Buffer.from(b64, "base64");
      let field = "photo";
      let filename = body.filename || "file.jpg";
      let method = "sendPhoto";
      if (action === "sendVoice") {
        field = "voice";
        filename = body.filename || "voice.ogg";
        method = "sendVoice";
      } else if (action === "sendVideo") {
        field = "video";
        filename = body.filename || "video.mp4";
        method = "sendVideo";
      } else if (mime.includes("png")) {
        filename = "image.png";
      }

      // multipart/form-data
      const boundary = "----BankMini" + Date.now();
      const chunks = [];
      const pushField = (name, value) => {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
          ),
        );
      };
      pushField("chat_id", chatId);
      if (text) pushField("caption", text.slice(0, 1000));
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
        ),
      );
      chunks.push(bin);
      chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
      const bodyBuf = Buffer.concat(chunks);

      const tgRes = await fetch(api + "/" + method, {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=" + boundary,
          "Content-Length": String(bodyBuf.length),
        },
        body: bodyBuf,
      });
      const data = await tgRes.json();
      res.status(data.ok ? 200 : 502).json({
        ok: !!data.ok,
        messageId: data.result && data.result.message_id,
        result: data,
      });
      return;
    }

    // default sendMessage
    const tgRes = await fetch(api + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000) || "(empty)",
        disable_web_page_preview: true,
      }),
    });
    const data = await tgRes.json();
    res.status(data.ok ? 200 : 502).json({
      ok: !!data.ok,
      messageId: data.result && data.result.message_id,
      result: data,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "notify failed" });
  }
};
