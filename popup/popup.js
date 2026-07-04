import { getToken, saveDocument, saveHighlight, listTags, ReadwiseError } from "../lib/readwise.js";
import { hasScripting } from "../lib/permissions.js";
import { captureContent } from "../lib/capture.js";

const el = (id) => document.getElementById(id);

let activeTab = null;
let captured = null; // { url, title, html, selection } when HTML capture is on

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(msg, kind) {
  const s = el("status");
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
}

function parseTags() {
  return el("tags").value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function busy(isBusy) {
  el("savePage").disabled = isBusy;
  el("saveHighlight").disabled = isBusy;
}

function reportError(e) {
  const msg = e instanceof ReadwiseError ? e.message : "Something went wrong. Check your connection.";
  setStatus(msg, "err");
}

async function savePage() {
  busy(true);
  setStatus("Saving…");
  try {
    await saveDocument(await getToken(), {
      url: captured?.url || activeTab.url,
      title: captured?.title || activeTab.title,
      html: captured?.html, // undefined in URL-only mode
      tags: parseTags(),
      location: el("location").value,
    });
    setStatus("Saved to Readwise ✓", "ok");
  } catch (e) {
    reportError(e);
  } finally {
    busy(false);
  }
}

async function saveSelectionHighlight() {
  if (!captured?.selection) return;
  busy(true);
  setStatus("Saving highlight…");
  try {
    await saveHighlight(await getToken(), {
      text: captured.selection,
      title: captured.title || activeTab.title,
      source_url: captured.url || activeTab.url,
    });
    setStatus("Highlight saved ✓", "ok");
  } catch (e) {
    reportError(e);
  } finally {
    busy(false);
  }
}

async function init() {
  const token = await getToken();
  if (!token) {
    el("setup").classList.remove("hidden");
    el("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
    return;
  }

  el("main").classList.remove("hidden");
  activeTab = await getActiveTab();
  el("pageTitle").textContent = activeTab?.title || activeTab?.url || "";
  el("pageTitle").title = activeTab?.url || "";

  el("savePage").addEventListener("click", savePage);
  el("saveHighlight").addEventListener("click", saveSelectionHighlight);

  // Tag suggestions (best-effort).
  listTags(token).then((tags) => {
    const list = el("tagSuggestions");
    for (const name of tags) {
      const opt = document.createElement("option");
      opt.value = name;
      list.appendChild(opt);
    }
  });

  // Capture mode: inject if the user opted in, to enable full-HTML saves and
  // selection highlighting. Otherwise stay URL-only and point at the context menu.
  const canInject = await hasScripting();
  if (canInject && activeTab?.id != null) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: captureContent,
      });
      captured = result || null;
    } catch {
      captured = null;
    }
    el("mode").textContent = "Full-page HTML capture is on.";
    if (captured?.selection) {
      el("saveHighlight").classList.remove("hidden");
    }
  } else {
    const link = document.createElement("a");
    link.textContent = "Enable HTML capture";
    link.addEventListener("click", () => chrome.runtime.openOptionsPage());
    el("mode").append("URL-only mode. ");
    el("mode").appendChild(link);
    el("mode").append(" · To highlight text, select it and right-click.");
  }
}

init();
