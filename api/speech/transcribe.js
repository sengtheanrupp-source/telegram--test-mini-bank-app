/**
 * Speech-to-text for iPhone Telegram (Web Speech API blocked).
 * Uses OpenAI Whisper or Groq Whisper when env key is set:
 *   OPENAI_API_KEY or GROQ_API_KEY
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
    const audioBase64 = body.audioBase64 || body.data || "";
    if (!audioBase64) {
      res.status(400).json({ ok: false, error: "no_audio" });
      return;
    }

    let b64 = audioBase64;
    let mime = body.mime || "audio/webm";
    const m = /^data:([^;]+);base64,(.+)$/s.exec(audioBase64);
    if (m) {
      mime = m[1];
      b64 = m[2];
    }
    const bin = Buffer.from(b64, "base64");
    if (bin.length < 100) {
      res.status(400).json({ ok: false, error: "audio_too_short" });
      return;
    }

    const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
    const groqKey = (process.env.GROQ_API_KEY || "").trim();
    const key = openaiKey || groqKey;
    const endpoint = openaiKey
      ? "https://api.openai.com/v1/audio/transcriptions"
      : groqKey
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "";

    if (!key || !endpoint) {
      res.status(200).json({
        ok: false,
        error: "no_stt_key",
        message:
          "Set OPENAI_API_KEY or GROQ_API_KEY on Vercel for iPhone voice-to-text",
      });
      return;
    }

    const ext = mime.includes("mp4")
      ? "mp4"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("mpeg") || mime.includes("mp3")
          ? "mp3"
          : "webm";
    const filename = "audio." + ext;
    const form = new FormData();
    const blob = new Blob([bin], { type: mime });
    form.append("file", blob, filename);
    form.append("model", openaiKey ? "whisper-1" : "whisper-large-v3");
    form.append("language", "km"); // Khmer preferred

    const tgRes = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
    });
    const data = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok) {
      res.status(200).json({
        ok: false,
        error: "stt_failed",
        detail: data.error || data,
      });
      return;
    }
    const text = (data.text || "").trim();
    res.status(200).json({ ok: true, text });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
};
