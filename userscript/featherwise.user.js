// ==UserScript==
// @name         Featherwise — save to Readwise
// @namespace    https://github.com/jaygoldman/featherwise
// @version      1.0.0
// @description  Save pages to Readwise Reader and text selections as highlights, from any page. Network-locked to readwise.io.
// @author       Jay Goldman
// @match        *://*/*
// @connect      readwise.io
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// @icon         https://github.com/jaygoldman/featherwise/raw/main/icons/icon48.png
// @homepageURL  https://github.com/jaygoldman/featherwise
// @supportURL   https://github.com/jaygoldman/featherwise/issues
// @updateURL    https://github.com/jaygoldman/featherwise/raw/main/userscript/featherwise.user.js
// @downloadURL  https://github.com/jaygoldman/featherwise/raw/main/userscript/featherwise.user.js
// @license      MIT
// ==/UserScript==

/*
 * Featherwise userscript — the Tampermonkey twin of the Featherwise Chrome extension.
 *
 * Security posture (for review):
 *   - @connect readwise.io  → GM_xmlhttpRequest is allow-listed to readwise.io ONLY.
 *                             The script cannot send data anywhere else, even if tampered with.
 *   - @grant (4 only)       → storage (get/set), the network call, and menu registration.
 *                             No clipboard, no cookie, no tab, no eval.
 *   - Inert by default      → it does nothing until you invoke a menu command or the hotkey.
 *                             Page content is read only at that moment, and only sent to Readwise.
 *   - @noframes             → runs once per page, never inside iframes.
 *
 * The token is stored by Tampermonkey (GM storage), never transmitted anywhere but readwise.io.
 */

(function () {
  "use strict";

  const BASE = "https://readwise.io";
  const K_TOKEN = "token";
  const K_HTML = "htmlCapture";
  const K_LOC = "defaultLocation";

  const FEATHER =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>' +
    '<line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>';

  // --- Storage --------------------------------------------------------------

  const getToken = () => GM_getValue(K_TOKEN, "") || "";
  const setToken = (t) => GM_setValue(K_TOKEN, t);
  const getHtmlPref = () => GM_getValue(K_HTML, false);
  const getDefaultLoc = () => GM_getValue(K_LOC, "new");

  // --- API (via GM_xmlhttpRequest, network-locked to readwise.io) ------------

  function gmFetch(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method,
        url: opts.url,
        headers: opts.headers,
        data: opts.data,
        timeout: 20000,
        onload: resolve,
        onerror: () => reject(new Error("Network error. Check your connection.")),
        ontimeout: () => reject(new Error("Request timed out.")),
      });
    });
  }

  const authHeaders = () => ({
    Authorization: `Token ${getToken()}`,
    "Content-Type": "application/json",
  });

  function checkRateLimit(res) {
    if (res.status === 429) {
      const m = /retry-after:\s*(\d+)/i.exec(res.responseHeaders || "");
      throw new Error(`Rate limited — try again in ${m ? m[1] : "a few"} seconds.`);
    }
    return res;
  }

  const ok = (res) => res.status >= 200 && res.status < 300;

  async function validateToken(token) {
    const res = await gmFetch({
      method: "GET",
      url: `${BASE}/api/v2/auth/`,
      headers: { Authorization: `Token ${token}` },
    });
    return res.status === 204;
  }

  async function saveDocument(doc) {
    const body = { url: doc.url, category: doc.category || "article" };
    if (doc.html) {
      body.html = doc.html;
      body.should_clean_html = true;
    }
    if (doc.title) body.title = doc.title;
    if (doc.tags && doc.tags.length) body.tags = doc.tags;
    if (doc.location) body.location = doc.location;

    const res = checkRateLimit(
      await gmFetch({ method: "POST", url: `${BASE}/api/v3/save/`, headers: authHeaders(), data: JSON.stringify(body) })
    );
    if (!ok(res)) throw new Error(`Save failed (HTTP ${res.status}).`);
    return JSON.parse(res.responseText || "{}");
  }

  async function saveHighlight(hl) {
    const highlight = { text: hl.text, category: "articles" };
    if (hl.title) highlight.title = hl.title;
    if (hl.source_url) highlight.source_url = hl.source_url;
    if (hl.note) highlight.note = hl.note;

    const res = checkRateLimit(
      await gmFetch({
        method: "POST",
        url: `${BASE}/api/v2/highlights/`,
        headers: authHeaders(),
        data: JSON.stringify({ highlights: [highlight] }),
      })
    );
    if (!ok(res)) throw new Error(`Highlight save failed (HTTP ${res.status}).`);
    return JSON.parse(res.responseText || "{}");
  }

  async function listTags() {
    try {
      const res = await gmFetch({ method: "GET", url: `${BASE}/api/v3/tags/`, headers: authHeaders() });
      if (!ok(res)) return [];
      const data = JSON.parse(res.responseText || "{}");
      return (data.results || []).map((t) => t.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  // --- UI (isolated in a shadow root so host-page CSS can't touch it) --------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(17,24,39,.45);
      display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; }
    .panel { width: 320px; max-width: 92vw; background: #fff; color: #1a1a1a; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.3); padding: 16px; }
    h1 { display: flex; align-items: center; gap: 7px; margin: 0 0 4px; font-size: 15px; font-weight: 600; }
    h1 .mark { flex: none; color: #9aa0aa; display: inline-flex; }
    .sub { margin: 0 0 6px; font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .muted { color: #6b7280; }
    label { display: block; margin: 10px 0 4px; font-size: 12px; font-weight: 500; }
    input[type=text], input[type=password], select { width: 100%; padding: 8px; border: 1px solid #d1d5db;
      border-radius: 6px; font-size: 13px; background: #fff; color: #1a1a1a; }
    .check { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12.5px; font-weight: 400; cursor: pointer; }
    .check input { width: 15px; height: 15px; flex: none; }
    .hint { margin: 6px 0 0; font-size: 11px; color: #6b7280; }
    .hint a { color: #3b5bdb; }
    .row { display: flex; gap: 8px; margin-top: 16px; }
    button { flex: 1; padding: 9px; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    button.primary { background: #3b5bdb; color: #fff; }
    button.ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; }
    button:disabled { opacity: .6; cursor: default; }
    .msg { margin: 10px 0 0; min-height: 15px; font-size: 12px; }
    .msg.err { color: #cc0000; } .msg.ok { color: #08761b; }
    .toast { position: fixed; left: 50%; bottom: 24px; z-index: 2147483647; transform: translateX(-50%) translateY(10px);
      display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-radius: 9px; font-size: 13px; font-weight: 500;
      color: #fff; background: #374151; box-shadow: 0 8px 24px rgba(0,0,0,.28); max-width: min(90vw, 360px);
      opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .toast.ok { background: #08761b; } .toast.err { background: #cc0000; }
    .toast::before { font-weight: 700; font-size: 13px; line-height: 1; }
    .toast.ok::before { content: "\\2713"; } .toast.err::before { content: "\\2715"; }
    .toast.busy::before { content: ""; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.4);
      border-top-color: #fff; border-radius: 50%; animation: fwspin .7s linear infinite; }
    @keyframes fwspin { to { transform: rotate(360deg); } }
  `;

  let shadow = null;
  let toastEl = null;
  let toastTimer = null;
  let currentOverlay = null;

  function ui() {
    if (shadow) return shadow;
    const host = document.createElement("div");
    host.id = "featherwise-root";
    (document.body || document.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    return shadow;
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in el) {
          try { el[k] = v; } catch { el.setAttribute(k, v); }
        } else el.setAttribute(k, v);
      }
    }
    for (const kid of kids) {
      if (kid == null) continue;
      el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return el;
  }

  const mark = () => h("span", { class: "mark", html: FEATHER });

  function closeOverlay() {
    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
    }
  }

  function openOverlay(panel) {
    const root = ui();
    closeOverlay();
    const overlay = h(
      "div",
      { class: "overlay", onclick: (e) => { if (e.target === overlay) closeOverlay(); } },
      panel
    );
    root.appendChild(overlay);
    currentOverlay = overlay;
    return overlay;
  }

  function toast(msg, kind = "") {
    const root = ui();
    if (!toastEl) {
      toastEl = h("div", { class: "toast" });
      root.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (kind ? " " + kind : "");
    if (toastTimer) clearTimeout(toastTimer);
    if (kind !== "busy") {
      toastTimer = setTimeout(() => { toastEl.className = "toast"; }, kind === "err" ? 4000 : 2200);
    }
  }

  function locationSelect(value) {
    const sel = h(
      "select",
      null,
      h("option", { value: "new" }, "New"),
      h("option", { value: "later" }, "Later"),
      h("option", { value: "archive" }, "Archive")
    );
    sel.value = value;
    return sel;
  }

  // --- Screens --------------------------------------------------------------

  function openPagePanel() {
    if (!getToken()) {
      openSettings("Add your Readwise token to start saving.");
      return;
    }
    const tags = h("input", { type: "text", placeholder: "e.g. research, to-read", list: "fw-tags", autocomplete: "off" });
    const dl = h("datalist", { id: "fw-tags" });
    const loc = locationSelect(getDefaultLoc());
    const htmlChk = h("input", { type: "checkbox" });
    htmlChk.checked = getHtmlPref();
    const msg = h("p", { class: "msg" });
    const saveBtn = h("button", { class: "primary" }, "Save page");
    const cancelBtn = h("button", { class: "ghost" }, "Cancel");

    const panel = h(
      "div",
      { class: "panel" },
      h("h1", null, mark(), "Featherwise"),
      h("p", { class: "sub", title: location.href }, document.title || location.href),
      h("label", null, "Tags ", h("span", { class: "muted" }, "(comma-separated)")),
      tags,
      dl,
      h("label", null, "Location"),
      loc,
      h("label", { class: "check" }, htmlChk, h("span", null, "Send full page HTML (for paywalled / logged-in pages)")),
      msg,
      h("div", { class: "row" }, cancelBtn, saveBtn)
    );

    openOverlay(panel);
    tags.focus();
    listTags().then((names) => names.forEach((n) => dl.appendChild(h("option", { value: n }))));

    cancelBtn.onclick = closeOverlay;
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      msg.className = "msg";
      const tagList = tags.value.split(",").map((s) => s.trim()).filter(Boolean);
      const sendHtml = htmlChk.checked;
      GM_setValue(K_LOC, loc.value);
      GM_setValue(K_HTML, sendHtml);
      toast("Saving…", "busy");
      try {
        await saveDocument({
          url: location.href,
          title: document.title,
          html: sendHtml ? document.documentElement.outerHTML : undefined,
          tags: tagList,
          location: loc.value,
        });
        closeOverlay();
        toast("Saved to Readwise", "ok");
      } catch (e) {
        toast(e.message || "Something went wrong.", "err");
        msg.textContent = e.message || "Something went wrong.";
        msg.className = "msg err";
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }

  async function doSaveHighlight() {
    if (!getToken()) {
      openSettings("Add your Readwise token to start saving.");
      return;
    }
    const text = (window.getSelection ? String(window.getSelection()) : "").trim();
    if (!text) {
      toast("Select some text first, then run this again.", "err");
      return;
    }
    toast("Saving highlight…", "busy");
    try {
      await saveHighlight({ text, title: document.title, source_url: location.href });
      toast("Highlight saved", "ok");
    } catch (e) {
      toast(e.message || "Something went wrong.", "err");
    }
  }

  function openSettings(message) {
    const has = !!getToken();
    const tokenInput = h("input", {
      type: "password",
      placeholder: has ? "Token saved — paste a new one to replace it" : "Readwise access token",
      autocomplete: "off",
    });
    const loc = locationSelect(getDefaultLoc());
    const htmlChk = h("input", { type: "checkbox" });
    htmlChk.checked = getHtmlPref();
    const msg = h("p", { class: "msg" });
    if (message) msg.textContent = message;
    const saveBtn = h("button", { class: "primary" }, "Save");
    const cancelBtn = h("button", { class: "ghost" }, "Close");

    const panel = h(
      "div",
      { class: "panel" },
      h("h1", null, mark(), "Featherwise settings"),
      h("label", null, "Access token"),
      tokenInput,
      h(
        "p",
        { class: "hint", html:
          'From <a href="https://readwise.io/access_token" target="_blank" rel="noopener">readwise.io/access_token</a>. ' +
          "Stored locally by Tampermonkey; sent only to readwise.io." }
      ),
      h("label", null, "Default location"),
      loc,
      h("label", { class: "check" }, htmlChk, h("span", null, "Send full page HTML by default")),
      msg,
      h("div", { class: "row" }, cancelBtn, saveBtn)
    );

    openOverlay(panel);
    tokenInput.focus();
    cancelBtn.onclick = closeOverlay;

    saveBtn.addEventListener("click", async () => {
      GM_setValue(K_LOC, loc.value);
      GM_setValue(K_HTML, htmlChk.checked);
      const t = tokenInput.value.trim();
      if (!t) {
        toast("Settings saved", "ok");
        closeOverlay();
        return;
      }
      saveBtn.disabled = true;
      msg.className = "msg";
      msg.textContent = "Validating…";
      try {
        const valid = await validateToken(t);
        if (valid) {
          setToken(t);
          msg.textContent = "Token saved and validated ✓";
          msg.className = "msg ok";
          toast("Settings saved", "ok");
          setTimeout(closeOverlay, 700);
        } else {
          msg.textContent = "That token was rejected by Readwise.";
          msg.className = "msg err";
          saveBtn.disabled = false;
        }
      } catch {
        msg.textContent = "Couldn't reach Readwise. Check your connection.";
        msg.className = "msg err";
        saveBtn.disabled = false;
      }
    });
  }

  // --- Triggers -------------------------------------------------------------

  GM_registerMenuCommand("Save page to Readwise Reader", openPagePanel);
  GM_registerMenuCommand("Save selection as highlight", doSaveHighlight);
  GM_registerMenuCommand("Featherwise settings…", () => openSettings());

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && currentOverlay) {
        closeOverlay();
        return;
      }
      const key = (e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "s") {
        e.preventDefault();
        openPagePanel();
      }
    },
    true
  );
})();
