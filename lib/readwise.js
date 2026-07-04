// Readwise API wrapper. Shared by the service worker and the popup/options pages
// via ES-module imports. Every call authenticates with a static token header;
// there is no OAuth or cookie flow, so the extension only ever talks to readwise.io.

const BASE = "https://readwise.io";
const TOKEN_KEY = "readwiseToken";

export class ReadwiseError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.name = "ReadwiseError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// --- Token storage -------------------------------------------------------

export async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || null;
}

export async function setToken(token) {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken() {
  await chrome.storage.local.remove(TOKEN_KEY);
}

// --- Internal helpers ----------------------------------------------------

function authHeaders(token) {
  return {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json",
  };
}

// Turns a 429 into a friendly ReadwiseError that carries the Retry-After value.
function checkRateLimit(res) {
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
    const secs = retryAfter ? `${retryAfter}` : "a few";
    throw new ReadwiseError(`Rate limited — try again in ${secs} seconds.`, 429, retryAfter);
  }
  return res;
}

// --- Endpoints -----------------------------------------------------------

// GET /api/v2/auth/ → 204 when the token is valid.
export async function validateToken(token) {
  const res = await fetch(`${BASE}/api/v2/auth/`, { headers: authHeaders(token) });
  return res.status === 204;
}

// POST /api/v3/save/ — save an article to Reader.
// doc: { url, html?, title?, tags?, location?, category? }
// When `html` is omitted, Readwise scrapes the URL server-side (URL-only mode).
export async function saveDocument(token, doc) {
  const body = { url: doc.url, category: doc.category || "article" };
  if (doc.html) {
    body.html = doc.html;
    body.should_clean_html = true;
  }
  if (doc.title) body.title = doc.title;
  if (doc.tags && doc.tags.length) body.tags = doc.tags;
  if (doc.location) body.location = doc.location;

  const res = checkRateLimit(
    await fetch(`${BASE}/api/v3/save/`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) throw new ReadwiseError(`Save failed (HTTP ${res.status}).`, res.status);
  return res.json();
}

// POST /api/v2/highlights/ — save a text selection as a highlight.
// hl: { text, title?, source_url?, note? }
export async function saveHighlight(token, hl) {
  const highlight = { text: hl.text, category: "articles" };
  if (hl.title) highlight.title = hl.title;
  if (hl.source_url) highlight.source_url = hl.source_url;
  if (hl.note) highlight.note = hl.note;

  const res = checkRateLimit(
    await fetch(`${BASE}/api/v2/highlights/`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ highlights: [highlight] }),
    })
  );
  if (!res.ok) throw new ReadwiseError(`Highlight save failed (HTTP ${res.status}).`, res.status);
  return res.json();
}

// GET /api/v3/tags/ — used for the popup's tag suggestions. Best-effort:
// returns [] on any failure so the UI degrades gracefully.
export async function listTags(token) {
  try {
    const res = checkRateLimit(
      await fetch(`${BASE}/api/v3/tags/`, { headers: authHeaders(token) })
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((t) => t.name).filter(Boolean);
  } catch {
    return [];
  }
}
