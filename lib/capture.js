// Injected into the active tab via chrome.scripting.executeScript({ func }).
// Runs in the PAGE's context and is serialized on injection, so it must be fully
// self-contained — no references to outer-scope variables or imports.
export function captureContent() {
  const selection = window.getSelection ? String(window.getSelection()) : "";
  return {
    url: location.href,
    title: document.title,
    html: document.documentElement.outerHTML,
    selection: selection.trim(),
  };
}
