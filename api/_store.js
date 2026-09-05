/**
 * _store.js
 * -----------------------------------------------------------------------
 * Tiny key/value storage helper used by the payment-link endpoints.
 *
 * Why this exists:
 *  Telegram Mini App "startapp" deep-link params are capped at 64 chars
 *  and must be [A-Za-z0-9_-] only, so we can't stuff the full order
 *  payload (customer_code, amount, return_url, ...) into the link itself.
 *  Instead we generate a short opaque token, store the order payload
 *  server-side keyed by that token, and the Mini App resolves it on load
 *  via /api/resolve-link.
 *
 * Storage backend:
 *  - If KV_REST_API_URL / KV_REST_API_TOKEN env vars are present (Vercel
 *    KV / Upstash Redis - free tier is enough for this), we use that so
 *    tokens survive across serverless function instances.
 *  - Otherwise we fall back to an in-memory Map. This is fine for local
 *    `vercel dev` testing but NOT reliable in production on Vercel, since
 *    each request can hit a different, stateless function instance.
 *    => For real staging/testing, set up KV (see DEEPLINK_GUIDE.md).
 */

const KV_URL = process.env.KV_REST_API_URL || "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN || "";

// In-memory fallback (per-instance only — dev/local testing use).
const memoryStore = global.__paymentLinkMemoryStore || new Map();
global.__paymentLinkMemoryStore = memoryStore;

function useKV() {
  return Boolean(KV_URL && KV_TOKEN);
}

async function kvCommand(segments) {
  const url = `${KV_URL.replace(/\/$/, "")}/${segments.map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`KV request failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Store a JSON-serializable value under `key`, expiring after `ttlSeconds`.
 */
async function setValue(key, value, ttlSeconds) {
  const serialized = JSON.stringify(value);

  if (useKV()) {
    const segments = ttlSeconds
      ? ["set", key, serialized, "EX", String(Math.max(1, Math.floor(ttlSeconds)))]
      : ["set", key, serialized];
    await kvCommand(segments);
    return;
  }

  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

/**
 * Retrieve a previously stored value, or null if missing/expired.
 */
async function getValue(key) {
  if (useKV()) {
    const result = await kvCommand(["get", key]);
    if (!result || result.result === null || result.result === undefined) {
      return null;
    }
    try {
      return JSON.parse(result.result);
    } catch (e) {
      return null;
    }
  }

  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

module.exports = { setValue, getValue, useKV };
