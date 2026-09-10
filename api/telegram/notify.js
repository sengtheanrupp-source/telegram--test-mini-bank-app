/**
 * Silent Telegram Bot proxy for community posts.
 * Server env (required for live channel/group delivery):
 *   TELEGRAM_BOT_TOKEN   - bot token from @BotFather
 *   TELEGRAM_CHANNEL_ID  - default @generalpost168
 *   TELEGRAM_GROUP_ID    - default @generalpost169 (public group username works)
 *
 * Bot must be admin of the channel and member/admin of the group.
 * Without TELEGRAM_BOT_TOKEN, returns { ok:true, skipped:true } so Mini App still works.
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
    res.status(405).json({ ok: false });
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    // Default bot token (override with env TELEGRAM_BOT_TOKEN if set)
    const DEFAULT_BOT_TOKEN =
      "6967209738:AAFbTVO3gsAuSVrTe23YUdUfauekL9NIMDQ";
    const botToken = (
      process.env.TELEGRAM_BOT_TOKEN ||
      body.botToken ||
      DEFAULT_BOT_TOKEN ||
      ""
    ).trim();
    if (!botToken) {
      res.status(200).json({ ok: true, skipped: true, reason: "no_bot_token" });
      return;
    }

    let chatId = "";
    if (body.target === "group") {
      chatId = (
        process.env.TELEGRAM_GROUP_ID ||
        body.chatId ||
        "@generalpost169"
      ).trim();
    } else {
      // channel default
      chatId = (
        process.env.TELEGRAM_CHANNEL_ID ||
        body.chatId ||
        "@generalpost168"
      ).trim();
    }
    if (!chatId) {
      res.status(200).json({ ok: true, skipped: true, reason: "no_chat_id" });
      return;
    }

    const action = (body.action || "sendMessage").trim();
    const text = body.text != null ? String(body.text) : "";
    const api = "https://api.telegram.org/bot" + botToken;

    if (action === "deleteMessage" && body.messageId) {
      const tgRes = await fetch(api + "/deleteMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: body.messageId }),
      });
      const data = await tgRes.json();
      res.status(200).json({ ok: !!data.ok, result: data });
      return;
    }

    if (
      (action === "sendPhoto" ||
        action === "sendVoice" ||
        action === "sendVideo") &&
      body.mediaBase64
    ) {
      let b64 = body.mediaBase64;
      let mime = "application/octet-stream";
      const m = /^data:([^;]+);base64,(.+)$/s.exec(body.mediaBase64);
      if (m) {
        mime = m[1];
        b64 = m[2];
      }
      const bin = Buffer.from(b64, "base64");
      let field = "photo";
      let filename = "file.jpg";
      let method = "sendPhoto";
      if (action === "sendVoice") {
        field = "voice";
        filename = "voice.ogg";
        method = "sendVoice";
      } else if (action === "sendVideo") {
        field = "video";
        filename = "video.mp4";
        method = "sendVideo";
      }
      const boundary = "----BankMini" + Date.now();
      const chunks = [];
      const pushField = (name, value) => {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
          ),
        );
      };
      pushField("chat_id", String(chatId));
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
        },
        body: bodyBuf,
      });
      const data = await tgRes.json();
      res.status(200).json({
        ok: !!data.ok,
        messageId: data.result && data.result.message_id,
        description: data.description,
      });
      return;
    }

    const tgRes = await fetch(api + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: (text || "(empty)").slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    const data = await tgRes.json();
    res.status(200).json({
      ok: !!data.ok,
      messageId: data.result && data.result.message_id,
      description: data.description,
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
};
