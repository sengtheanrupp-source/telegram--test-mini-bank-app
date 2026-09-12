/**
 * Shared community feed for all Mini App users.
 * - POST: save post/comment/reaction (all devices)
 * - GET: return shared feed
 * Persists via Telegram channel/group + in-process cache.
 * Structured messages can be rebuilt from getUpdates.
 */
const BOT =
  process.env.TELEGRAM_BOT_TOKEN ||
  "6967209738:AAFbTVO3gsAuSVrTe23YUdUfauekL9NIMDQ";
const CHANNEL =
  process.env.TELEGRAM_CHANNEL_ID || "@generalpost168";
const GROUP =
  process.env.TELEGRAM_GROUP_ID || "@generalpost169";

function getStore() {
  if (!global.__BANK_COMMUNITY_FEED) {
    global.__BANK_COMMUNITY_FEED = { posts: [], updatedAt: 0 };
  }
  return global.__BANK_COMMUNITY_FEED;
}

async function tg(method, body) {
  const res = await fetch(
    "https://api.telegram.org/bot" + BOT + "/" + method,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return res.json().catch(() => ({}));
}

function parsePostFromText(text, meta) {
  if (!text || !text.includes("BANK_POST|")) return null;
  try {
    const raw = text.split("BANK_POST|")[1];
    const obj = JSON.parse(raw);
    if (!obj || !obj.id) return null;
    return {
      id: obj.id,
      author: obj.author || meta.author || "User",
      authorId: obj.authorId || "",
      caption: obj.caption || "",
      media: obj.media || "",
      type: obj.type || "text",
      time: obj.time || new Date().toLocaleString(),
      ts: obj.ts || Date.now(),
      reactions: obj.reactions || { like: 0, love: 0, fire: 0 },
      comments: obj.comments || [],
      tgMessageId: meta.messageId,
    };
  } catch (e) {
    return null;
  }
}

function parseCommentFromText(text) {
  if (!text || !text.includes("BANK_COMMENT|")) return null;
  try {
    return JSON.parse(text.split("BANK_COMMENT|")[1]);
  } catch (e) {
    return null;
  }
}

function parseReactFromText(text) {
  if (!text || !text.includes("BANK_REACT|")) return null;
  try {
    return JSON.parse(text.split("BANK_REACT|")[1]);
  } catch (e) {
    return null;
  }
}

async function hydrateFromTelegram() {
  const store = getStore();
  try {
    const data = await tg("getUpdates", { limit: 50, timeout: 0 });
    if (!data.ok || !Array.isArray(data.result)) return;
    for (const u of data.result) {
      const msg =
        u.channel_post ||
        u.message ||
        u.edited_channel_post ||
        u.edited_message;
      if (!msg || !msg.text) continue;
      const text = msg.text;
      const post = parsePostFromText(text, {
        messageId: msg.message_id,
        author: msg.from
          ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ")
          : "User",
      });
      if (post) {
        const idx = store.posts.findIndex((p) => p.id === post.id);
        if (idx >= 0) store.posts[idx] = { ...store.posts[idx], ...post };
        else store.posts.push(post);
        continue;
      }
      const c = parseCommentFromText(text);
      if (c && c.postId) {
        let p = store.posts.find((x) => x.id === c.postId);
        if (!p) {
          p = {
            id: c.postId,
            author: c.postAuthor || "User",
            authorId: "",
            caption: c.postCaption || "",
            media: "",
            type: "text",
            time: c.time || "",
            ts: c.ts || Date.now(),
            reactions: { like: 0, love: 0, fire: 0 },
            comments: [],
          };
          store.posts.push(p);
        }
        if (!p.comments) p.comments = [];
        if (c.replyTo) {
          const parent = p.comments.find((x) => x.id === c.replyTo);
          if (parent) {
            if (!parent.replies) parent.replies = [];
            if (!parent.replies.some((r) => r.id === c.id)) {
              parent.replies.push({
                id: c.id,
                author: c.author,
                authorId: c.authorId,
                text: c.text,
                time: c.time,
                voice: !!c.voice,
              });
            }
          }
        } else if (!p.comments.some((x) => x.id === c.id)) {
          p.comments.push({
            id: c.id,
            author: c.author,
            authorId: c.authorId,
            text: c.text,
            time: c.time,
            voice: !!c.voice,
            replies: c.replies || [],
          });
        }
        continue;
      }
      const r = parseReactFromText(text);
      if (r && r.postId) {
        const p = store.posts.find((x) => x.id === r.postId);
        if (p) {
          if (!p.reactions) p.reactions = { like: 0, love: 0, fire: 0 };
          if (r.kind && p.reactions[r.kind] != null) {
            p.reactions[r.kind] = Math.max(
              p.reactions[r.kind] || 0,
              r.count || (p.reactions[r.kind] || 0) + 1,
            );
          }
        }
      }
    }
    store.posts.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (store.posts.length > 80) store.posts = store.posts.slice(-80);
    store.updatedAt = Date.now();
  } catch (e) {
    // ignore
  }
}

async function mirrorPostToTelegram(post) {
  // Human-readable + machine payload for other devices via getUpdates
  const payload = {
    id: post.id,
    author: post.author,
    authorId: post.authorId,
    caption: (post.caption || "").slice(0, 500),
    type: post.type || "text",
    time: post.time,
    ts: post.ts,
    reactions: post.reactions || { like: 0, love: 0, fire: 0 },
    // do not embed large base64 in Telegram text
    hasMedia: !!post.media,
  };
  const text =
    "📢 " +
    (post.author || "User") +
    (post.caption ? "\n\n" + post.caption : "") +
    "\n\nBANK_POST|" +
    JSON.stringify(payload);
  await tg("sendMessage", {
    chat_id: CHANNEL,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  });
}

async function mirrorCommentToTelegram(c) {
  const text =
    (c.voice ? "🎤 " : "💬 ") +
    (c.author || "User") +
    ": " +
    (c.text || "") +
    "\n\nBANK_COMMENT|" +
    JSON.stringify({
      id: c.id,
      postId: c.postId,
      author: c.author,
      authorId: c.authorId,
      text: c.text,
      time: c.time,
      ts: c.ts || Date.now(),
      replyTo: c.replyTo || null,
      voice: !!c.voice,
      postAuthor: c.postAuthor,
      postCaption: c.postCaption,
    });
  await tg("sendMessage", {
    chat_id: GROUP,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  });
}

async function mirrorReactToTelegram(postId, kind, count, author) {
  const text =
    (kind === "love" ? "❤️" : kind === "fire" ? "🔥" : "👍") +
    " " +
    (author || "") +
    "\n\nBANK_REACT|" +
    JSON.stringify({ postId, kind, count, ts: Date.now() });
  await tg("sendMessage", {
    chat_id: CHANNEL,
    text: text.slice(0, 500),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const store = getStore();

  try {
    if (req.method === "GET") {
      await hydrateFromTelegram();
      res.status(200).json({
        ok: true,
        posts: store.posts,
        updatedAt: store.updatedAt || Date.now(),
      });
      return;
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};
      const action = body.action || "upsertPost";

      if (action === "upsertPost" && body.post) {
        const post = body.post;
        if (!post.id) {
          res.status(400).json({ ok: false, error: "missing id" });
          return;
        }
        const idx = store.posts.findIndex((p) => p.id === post.id);
        // Keep media only on creator device in local cache; shared feed stores caption meta
        const shared = {
          ...post,
          media: post.media && String(post.media).length < 50000 ? post.media : "",
          comments: post.comments || [],
          reactions: post.reactions || { like: 0, love: 0, fire: 0 },
        };
        if (idx >= 0) store.posts[idx] = { ...store.posts[idx], ...shared };
        else store.posts.push(shared);
        store.updatedAt = Date.now();
        if (body.mirror !== false) {
          try {
            await mirrorPostToTelegram(shared);
          } catch (e) {}
        }
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      if (action === "addComment" && body.comment && body.postId) {
        let p = store.posts.find((x) => x.id === body.postId);
        if (!p) {
          p = {
            id: body.postId,
            author: body.comment.postAuthor || "User",
            caption: "",
            type: "text",
            ts: Date.now(),
            reactions: { like: 0, love: 0, fire: 0 },
            comments: [],
          };
          store.posts.push(p);
        }
        if (!p.comments) p.comments = [];
        const c = body.comment;
        if (c.replyTo) {
          const parent = p.comments.find((x) => x.id === c.replyTo);
          if (parent) {
            if (!parent.replies) parent.replies = [];
            if (!parent.replies.some((r) => r.id === c.id)) parent.replies.push(c);
          }
        } else if (!p.comments.some((x) => x.id === c.id)) {
          p.comments.push({ ...c, replies: c.replies || [] });
        }
        store.updatedAt = Date.now();
        try {
          await mirrorCommentToTelegram({
            ...c,
            postId: body.postId,
            postAuthor: p.author,
            postCaption: p.caption,
          });
        } catch (e) {}
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      if (action === "react" && body.postId && body.kind) {
        const p = store.posts.find((x) => x.id === body.postId);
        if (p) {
          if (!p.reactions) p.reactions = { like: 0, love: 0, fire: 0 };
          p.reactions[body.kind] = (p.reactions[body.kind] || 0) + 1;
          store.updatedAt = Date.now();
          try {
            await mirrorReactToTelegram(
              body.postId,
              body.kind,
              p.reactions[body.kind],
              body.author || "",
            );
          } catch (e) {}
        }
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      if (action === "deletePost" && body.postId) {
        store.posts = store.posts.filter((p) => p.id !== body.postId);
        store.updatedAt = Date.now();
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      if (action === "replaceAll" && Array.isArray(body.posts)) {
        store.posts = body.posts.slice(-80);
        store.updatedAt = Date.now();
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      res.status(400).json({ ok: false, error: "unknown action" });
      return;
    }

    res.status(405).json({ ok: false });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message, posts: store.posts });
  }
};
