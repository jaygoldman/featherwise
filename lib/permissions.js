// Runtime management of the optional `scripting` permission. The extension only
// holds this capability while the user has "Capture full page HTML" enabled;
// otherwise it is never granted, and saves fall back to URL-only mode.

const SCRIPTING = { permissions: ["scripting"] };
const PREF_KEY = "htmlCapture";

// Source of truth is the actual granted permission, not the stored preference.
export async function hasScripting() {
  return chrome.permissions.contains(SCRIPTING);
}

// Must be called from a user gesture (e.g. a checkbox/button click), or Chrome
// rejects the request. Returns whether the permission ended up granted.
export async function enableHtmlCapture() {
  const granted = await chrome.permissions.request(SCRIPTING);
  await chrome.storage.local.set({ [PREF_KEY]: granted });
  return granted;
}

export async function disableHtmlCapture() {
  await chrome.permissions.remove(SCRIPTING);
  await chrome.storage.local.set({ [PREF_KEY]: false });
}
