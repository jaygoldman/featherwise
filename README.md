# Featherwise

<img src="icons/icon128.png" width="72" align="right" alt="Featherwise icon" />

A Manifest V3 Chrome extension that saves pages to **Readwise Reader** and text selections as **Readwise highlights** — designed to request the **minimum Chrome permissions possible**.

> Featherwise is an independent, community-built tool. It is not affiliated with or endorsed by Readwise.

## Permissions

| Permission | Why | Install warning? |
|---|---|---|
| `storage` | Store your access token locally | None |
| `activeTab` | Read the current tab's URL/title when you invoke the extension | None |
| `contextMenus` | Right-click "Save to Readwise" items | None |
| `host_permissions: https://readwise.io/*` | Call the Readwise API directly | "Read & change data on readwise.io" |
| `scripting` *(optional)* | Capture full page HTML — **only requested when you turn it on** | None |

Explicitly **not** used: `tabs`, `<all_urls>`, broad host access, notifications. Feedback uses the toolbar badge (✓ / !).

### Full-page HTML capture (opt-in)

By default, saving sends only the page URL and Readwise fetches the article server-side. Enable **Capture full page HTML** in the options page to send the page's own HTML instead — needed for paywalled or logged-in pages. Enabling it requests the `scripting` permission at runtime; disabling it removes the permission. Highlights from the right-click menu never need this permission.

## Setup

1. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.
2. Open the extension's **options** and paste your token from [readwise.io/access_token](https://readwise.io/access_token). It is validated against the API before being stored.
3. (Optional) Set a keyboard shortcut at `chrome://extensions/shortcuts` (default `Ctrl/Cmd+Shift+S`).

## Usage

- **Toolbar icon / keyboard shortcut** → popup: pick tags + location, save the page, or (with HTML capture on) save a selection as a highlight.
- **Right-click a page** → "Save page to Readwise Reader" (quick save).
- **Right-click a selection** → "Save selection as highlight" (works without the scripting permission).

## API

Uses the Readwise Reader API (`/api/v3/save/`), the classic Highlights API (`/api/v2/highlights/`), token validation (`/api/v2/auth/`), and tag suggestions (`/api/v3/tags/`). All requests are authenticated with an `Authorization: Token …` header.

## Notes

- No build step and no dependencies — plain ES modules, loadable unpacked as-is.
- The token is stored in `chrome.storage.local`, which is unencrypted but isolated to this extension.

## License

[MIT](LICENSE) © 2026 Jay Goldman
