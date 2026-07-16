# Featherwise

<img src="icons/icon128.png" width="72" align="right" alt="Featherwise icon" />

Save pages to **Readwise Reader** and text selections as **Readwise highlights** — designed to request the **minimum permissions possible**. Available two ways:

- **Chrome extension** (Manifest V3) — the leanest footprint. See below.
- **Tampermonkey userscript** — one auditable file, network-locked to `readwise.io`, for environments where a userscript manager is approved but custom extensions aren't. [Jump to it ↓](#tampermonkey-userscript)

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

## Tampermonkey userscript

For environments where **Tampermonkey is approved but custom extensions are not**, [`userscript/featherwise.user.js`](userscript/featherwise.user.js) delivers the same features as one small, auditable file.

**Install:** with Tampermonkey installed, open [`userscript/featherwise.user.js`](userscript/featherwise.user.js) (raw) and Tampermonkey will offer to install it. Then run **Featherwise settings…** from the Tampermonkey menu and paste your token from [readwise.io/access_token](https://readwise.io/access_token).

**Use** — from the Tampermonkey menu, the right-click menu, or a keyboard shortcut:

- **Save page to Readwise Reader** (`Alt/Opt+Shift+S`) → an in-page panel for tags, location, and optional full-HTML capture.
- **Save selection as highlight** (`Alt/Opt+Shift+H`) → saves the current text selection.
- **Featherwise settings…** → token, default location, and default HTML capture.

**What IT reviews** — the metadata block declares the entire surface:

| Directive | Value | Meaning |
|---|---|---|
| `@connect` | `readwise.io` | Network **allow-list** — the script can reach *no other host*, enforced by Tampermonkey. |
| `@grant` | `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, `GM_registerMenuCommand` | Storage, the Readwise request, and menu items. No clipboard, cookies, tabs, or eval. |
| `@match` | `*://*/*` | Runs on any page so you can save it — but is **inert until you invoke a command**, reading page content only at that moment. |
| `@noframes` | — | Never runs inside iframes. |

Notable differences from the extension: the UI is an injected panel (isolated in a Shadow DOM) instead of a toolbar popup, and full-HTML capture is a per-save checkbox rather than a runtime permission (a userscript inherently has page access). The token is stored in Tampermonkey's storage and sent only to `readwise.io`.

## License

[MIT](LICENSE) © 2026 Jay Goldman
