import { getToken, setToken, validateToken } from "../lib/readwise.js";
import { hasScripting, enableHtmlCapture, disableHtmlCapture } from "../lib/permissions.js";

const el = (id) => document.getElementById(id);

function setStatus(id, msg, kind) {
  const s = el(id);
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
}

// --- Token -----------------------------------------------------------------

async function saveToken() {
  const token = el("token").value.trim();
  if (!token) {
    setStatus("tokenStatus", "Enter a token first.", "err");
    return;
  }
  el("save").disabled = true;
  setStatus("tokenStatus", "Validating…");
  try {
    const ok = await validateToken(token);
    if (!ok) {
      setStatus("tokenStatus", "That token was rejected by Readwise.", "err");
      return;
    }
    await setToken(token);
    setStatus("tokenStatus", "Token saved and validated ✓", "ok");
  } catch {
    setStatus("tokenStatus", "Couldn't reach Readwise. Check your connection.", "err");
  } finally {
    el("save").disabled = false;
  }
}

// --- HTML capture toggle ---------------------------------------------------

async function syncToggle() {
  el("htmlCapture").checked = await hasScripting();
}

async function onToggle(e) {
  // The checkbox change is the user gesture that authorizes the permission request.
  if (e.target.checked) {
    const granted = await enableHtmlCapture();
    if (granted) {
      setStatus("captureStatus", "HTML capture enabled — scripting permission granted.", "ok");
    } else {
      setStatus("captureStatus", "Permission denied. Staying in URL-only mode.", "err");
    }
  } else {
    await disableHtmlCapture();
    setStatus("captureStatus", "HTML capture disabled — scripting permission removed.", "ok");
  }
  await syncToggle();
}

// --- Init ------------------------------------------------------------------

async function init() {
  const existing = await getToken();
  if (existing) {
    el("token").placeholder = "Token saved — paste a new one to replace it";
    setStatus("tokenStatus", "A token is already stored.", "ok");
  }

  await syncToggle();

  el("save").addEventListener("click", saveToken);
  el("token").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveToken();
  });
  el("htmlCapture").addEventListener("change", onToggle);

  // Keep the toggle honest if the permission changes elsewhere.
  chrome.permissions.onAdded.addListener(syncToggle);
  chrome.permissions.onRemoved.addListener(syncToggle);
}

init();
