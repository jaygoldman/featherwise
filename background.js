// Service worker: registers context menus and handles the quick-save paths.
// Feedback is shown via the action badge (no notifications permission needed).

import { getToken, saveDocument, saveHighlight } from "./lib/readwise.js";
import { hasScripting } from "./lib/permissions.js";
import { captureContent } from "./lib/capture.js";

const MENU_SAVE_PAGE = "readwise-save-page";
const MENU_SAVE_HIGHLIGHT = "readwise-save-highlight";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SAVE_PAGE,
    title: "Save page to Readwise Reader",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SAVE_HIGHLIGHT,
    title: "Save selection as highlight",
    contexts: ["selection"],
  });
});

// Transient badge feedback, auto-cleared. ✓ = success, ! = error.
async function badge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}

// Only injects if the user has opted into HTML capture; returns null otherwise
// (or on any injection failure), so callers fall back to URL-only saves.
async function tryCaptureHtml(tabId) {
  if (tabId == null || !(await hasScripting())) return null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: captureContent,
    });
    return result || null;
  } catch {
    return null;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const token = await getToken();
  if (!token) {
    await badge("!", "#cc0000");
    chrome.runtime.openOptionsPage();
    return;
  }

  try {
    if (info.menuItemId === MENU_SAVE_PAGE) {
      const captured = await tryCaptureHtml(tab?.id);
      await saveDocument(token, {
        url: captured?.url || info.pageUrl || tab?.url,
        html: captured?.html,
        title: captured?.title || tab?.title,
        location: "new",
      });
      await badge("✓", "#008a00");
    } else if (info.menuItemId === MENU_SAVE_HIGHLIGHT) {
      // Uses Chrome's selectionText directly — no injection, so highlights work
      // even when the scripting permission is not granted.
      await saveHighlight(token, {
        text: info.selectionText,
        source_url: info.pageUrl || tab?.url,
        title: tab?.title,
      });
      await badge("✓", "#008a00");
    }
  } catch {
    await badge("!", "#cc0000");
  }
});
