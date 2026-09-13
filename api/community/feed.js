/**
 * Shared community feed — human-readable Telegram only (no BANK_* machine payloads).
 * Durable across deploys via: in-memory cache + clients rehydrate (push local 3-month posts).
 */
const BOT =
  process.env.TELEGRAM_BOT_TOKEN ||
  "6967209738:AAFbTVO3gsAuSVrTe23YUdUfauekL9NIMDQ";
const CHANNEL =
  process.env.TELEGRAM_CHANNEL_ID || "@generalpost168";
const GROUP =
  process.env.TELEGRAM_GROUP_ID || "@generalpost169";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function getStore() {
  if (!global.__BANK_COMMUNITY_FEED) {
    global.__BANK_COMMUNITY_FEED = { posts: [], updatedAt: 0 };
  }
  return global.__BANK_COMMUNITY_FEED;
}

function pruneOld(posts) {
  const cut = Date.now() - THREE_MONTHS_MS;
  return (posts || []).filter((p) => (p.ts || 0) >= cut || !p.ts).slice(-200);
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

function mergePosts(a, b) {
  const map = new Map();
  [...(a || []), ...(b || [])].forEach((p) => {
    if (!p || !p.id) return;
    const prev = map.get(p.id);
    if (!prev) {
      map.set(p.id, {
        ...p,
        comments: p.comments || [],
        reactions: p.reactions || { like: 0, love: 0, fire: 0 },
      });
      return;
    }
    const comments = [...(prev.comments || [])];
    (p.comments || []).forEach((c) => {
      if (!c || !c.id) return;
      const i = comments.findIndex((x) => x.id === c.id);
      if (i < 0) comments.push(c);
      else {
        const replies = [...(comments[i].replies || [])];
        (c.replies || []).forEach((r) => {
          if (r && r.id && !replies.some((x) => x.id === r.id)) replies.push(r);
        });
        comments[i] = { ...comments[i], ...c, replies };
      }
    });
    map.set(p.id, {
      ...prev,
      ...p,
      media: p.media || prev.media || "",
      comments,
      reactions: {
        like: Math.max(prev.reactions?.like || 0, p.reactions?.like || 0),
        love: Math.max(prev.reactions?.love || 0, p.reactions?.love || 0),
        fire: Math.max(prev.reactions?.fire || 0, p.reactions?.fire || 0),
      },
      ts: Math.max(prev.ts || 0, p.ts || 0),
    });
  });
  return pruneOld(Array.from(map.values()).sort((x, y) => (x.ts || 0) - (y.ts || 0)));
}

/** Human-only message for channel — no machine JSON */
async function mirrorPostHuman(post) {
  const caption =
    "📢 " +
    (post.author || "User") +
    (post.caption ? "\n\n" + post.caption : "");
  await tg("sendMessage", {
    chat_id: CHANNEL,
    text: caption.slice(0, 4000),
    disable_web_page_preview: true,
  });
}

async function mirrorCommentHuman(c) {
  const line =
    (c.voice ? "🎤 " : c.replyTo ? "↩️ " : "💬 ") +
    (c.author || "User") +
    (c.text ? ": " + c.text : c.voice ? " sent a voice note" : "");
  await tg("sendMessage", {
    chat_id: GROUP,
    text: line.slice(0, 4000),
    disable_web_page_preview: true,
  });
}

async function mirrorReactHuman(kind, author, postAuthor) {
  const emoji = kind === "love" ? "❤️" : kind === "fire" ? "🔥" : "👍";
  await tg("sendMessage", {
    chat_id: CHANNEL,
    text: emoji + " " + (author || "User") + " on " + (postAuthor || "a post"),
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
  store.posts = pruneOld(store.posts);

  try {
    if (req.method === "GET") {
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
        store.posts = mergePosts(store.posts, [
          {
            ...post,
            media:
              post.media && String(post.media).length < 50000 ? post.media : "",
            comments: post.comments || [],
            reactions: post.reactions || { like: 0, love: 0, fire: 0 },
          },
        ]);
        store.updatedAt = Date.now();
        if (body.mirror !== false) {
          try {
            await mirrorPostHuman(post);
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
        store.posts = pruneOld(store.posts);
        store.updatedAt = Date.now();
        if (body.mirror !== false) {
          try {
            await mirrorCommentHuman(c);
          } catch (e) {}
        }
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      if (action === "react" && body.postId && body.kind) {
        const p = store.posts.find((x) => x.id === body.postId);
        if (p) {
          if (!p.reactions) p.reactions = { like: 0, love: 0, fire: 0 };
          p.reactions[body.kind] = (p.reactions[body.kind] || 0) + 1;
          store.updatedAt = Date.now();
          if (body.mirror !== false) {
            try {
              await mirrorReactHuman(body.kind, body.author, p.author);
            } catch (e) {}
          }
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

      // Clients rehydrate server after deploy (merge up to 3 months of local posts)
      if (action === "rehydrate" && Array.isArray(body.posts)) {
        store.posts = mergePosts(store.posts, body.posts);
        store.updatedAt = Date.now();
        res.status(200).json({ ok: true, posts: store.posts });
        return;
      }

      if (action === "replaceAll" && Array.isArray(body.posts)) {
        store.posts = pruneOld(body.posts);
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
