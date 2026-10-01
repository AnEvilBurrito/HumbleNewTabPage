# Privacy Policy

Flame × Humble New Tab does not collect or transmit bookmarks, settings, or telemetry to a developer-operated service.

## Local data

Imported YAML, quick-added bookmarks, category visibility, column layout, open/closed state, and appearance settings are stored in localStorage for this extension in the current browser profile. They are not written to browser-owned bookmarks, synchronized with Flame, or automatically shared with other devices. The source YAML file is only read when you select it; it is not watched or modified.

Data persists across new-tab pages and browser restarts. Uninstalling the extension removes its local storage. Export YAML and Export Settings create user-controlled copies that can contain private URLs, bookmark names, comments, and configuration; handle those files accordingly.

## Icons and optional browser features

Custom bookmark icons and the YAML parser are bundled with the extension and do not require a CDN, third-party favicon provider, or network lookup.

If enabled, Most visited, Recently closed, Other devices, and Apps use the corresponding browser APIs. The extension does not use the browser bookmarks API. Optional non-custom page links may use Chrome's favicon endpoint. Browser-managed favicon loading/caching is governed by the browser, not a developer-operated icon service.

Opening a bookmark navigates to its destination normally. User-configured remote background images can also cause the browser to fetch their URLs. Those destination sites have their own privacy policies.
