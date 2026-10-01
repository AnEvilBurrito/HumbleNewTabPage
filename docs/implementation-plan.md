# Flame × Humble implementation plan

Status: implemented. See [verification.md](verification.md) for test results and remaining verification limits.

Scope addition approved after this plan was written: new-tab **quick add**, category creation, and per-bookmark **Edit/Delete** context-menu actions. These mutations update the same YAML-backed list and appear in exports. A toolbar Save current page shortcut remains deferred.

UI refinement: remove the top Add bookmark / Import YAML action row so the page begins with bookmark categories and links. Both actions are available in Options; category context menus retain Add bookmark here.

## 1. Goal and agreed scope

Create a new-tab extension with an independent, user-managed bookmark list imported from Flame-compatible YAML. Combine Flame-inspired colors and Material Design Icons (MDI) with Humble's lightweight, draggable columns and collapsible folders.

Confirmed decisions:

- **Custom bookmarks only.** Do not display, read, create, update, or delete browser-owned bookmarks. There will be no browser/custom source switch.
- **Flame theme, Humble layout.** Retain column reordering, category/folder toggling, keyboard navigation, link-opening preferences, and appearance customization.
- Import a local YAML file or edit/paste YAML in Options.
- Add bookmarks directly from the new tab, create categories, and edit/delete bookmarks using context menus.
- Keep bookmarks locally in the extension; no Flame server is required.

Non-goals for the first implementation:

- A complete Flame dashboard/grid rewrite.
- Synchronization with Flame, browser bookmarks, or remote YAML URLs.
- Watching a file on disk after import.
- Nested categories, per-bookmark drag-and-drop, or a toolbar Save current page shortcut.
- Automatically importing the repository's personal `flame.yaml` on installation.

The detailed behaviors below are proposed defaults for implementation, not additional user-confirmed requirements.

## 2. Current project and integration points

The project is a static Manifest V3 extension without an existing package manifest, build pipeline, or test suite.

| File | Current role | Planned change |
| --- | --- | --- |
| `newtab.js` | Rendering, columns, settings, browser API access | Integrate an independent bookmark provider; remove browser bookmark paths; add YAML controls and theme |
| `newtab.html` | Page and Options markup | Add custom-bookmark editor/import/export controls and locally bundled scripts |
| `newtab.css` | Page and Options styles | Style MDI icons, category headings, status messages, and empty state |
| `manifest.json` | Chrome permissions and new-tab entry point | Remove `bookmarks`; update description; audit remaining permissions |
| `README.md` | Upstream installation and features | Document fork features, YAML usage, development, and migration |
| `privacy.md` | Upstream privacy policy | Describe local storage and remove obsolete Firefox icon-provider claims |
| `flame.yaml` | User-provided source list | Leave unchanged; use as a local compatibility check, not a shipped default |

Key code paths are `getChildrenFunction`, `getSubTree`, `getIcon`, `loadColumns`, `verifyColumns`, and `initSettings`. The options panel currently depends on `chrome.bookmarks.getTree`, so removing bookmark reads must also decouple settings initialization from that callback.

The existing Recent bookmarks feature reads browser bookmarks and must be removed, including its configuration controls and saved layout references. Remove the browser bookmark-manager context-menu action too.

## 3. YAML contract

Support the structure already used by `flame.yaml`:

```yaml
categories:
  - name: Work
    pinned: true
    bookmarks:
      - name: Mail
        url: https://mail.example.com/#inbox
        icon: gmail
      - name: Local service
        url: http://192.168.1.10:8080/
        icon: server
  - name: Reading
    bookmarks: []
```

Validation rules:

- Root must be a mapping containing a `categories` array.
- Each category must have a nonblank string `name` and a `bookmarks` array.
- `pinned` is optional, defaults to `false`, and must be a boolean when present.
- Each bookmark must have nonblank string `name` and `url` fields.
- `icon` is an optional MDI name, accepting bare names and the `mdi-` prefix.
- Trim names for matching; reject duplicate category names and duplicate bookmark names within one category. The same bookmark name in different categories is valid.
- Accept empty lists. Ignore unknown fields with a warning so future Flame metadata does not break imports.
- Use an explicit URL protocol allowlist: `http:`, `https:`, `file:`, and `chrome:`. Reject relative URLs, malformed URLs, and executable schemes such as `javascript:` and `data:`. Do not silently rewrite URLs.
- Preserve URL fragments and query strings, including the literal `#` and `&` characters present in the supplied file.
- Limit source size to 1 MiB and normalized content to 200 categories / 10,000 bookmarks. Apply the same limits to file import, editor saves, and restored data.

Use a maintained YAML parser, not a handwritten indentation parser. Verify and pin its version during implementation; bundle it locally with its license. Select safe parsing/schema options, reject duplicate mapping keys and custom executable tags, and bound resource use. The implementation rejects all YAML aliases and limits nesting to 40 levels for predictable safe AST editing.

### Import and pinning semantics

- **Import replaces the entire custom list**, rather than merging records. Show a preview/count and require an explicit Apply action; remind users to export before replacing an existing list.
- Match category identity by trimmed name, so URL/icon edits and YAML reordering preserve category layout state. A category rename is treated as removal plus addition.
- Preserve YAML order on first import and when placing newly added categories. `pinned` does not override later drag-and-drop ordering.
- Proposed meaning of `pinned`: initially expand a category, not lock it or make it mandatory. Explicit saved open/closed state overrides this default when Remember open folders is enabled. Store both states; otherwise a pinned category could never stay closed after reload.
- With Remember open folders disabled, initialize from `pinned` on each render.

## 4. Data and persistence architecture

Add a small module, tentatively `custom-bookmarks.js`, separating parsing, validation, normalization, and persistence from DOM rendering.

Normalized nodes should fit Humble's existing renderer:

- Category: `{ id, title, pinned, children }`.
- Bookmark: `{ id, title, url, mdiIcon }`.
- Generate deterministic namespaced IDs from encoded category/bookmark names, rather than numeric browser IDs or array positions. Use a map for lookup; avoid user-controlled object property names.
- The provider exposes root categories, node lookup, and child lookup without browser API calls.

Keep the existing localStorage approach for this first iteration; a background worker or storage permission is not necessary.

- Store the original YAML and a schema version in one namespaced record, e.g. `customBookmarks.v1`. Derive the normalized tree at load time rather than persisting conflicting copies.
- Keep custom column and open-state keys separate from legacy browser layout keys.
- Parse and validate the whole input before committing. A syntax, validation, or storage-quota failure must leave the previous list intact.
- Handle corrupt saved data with a recoverable error and export/reimport path; do not silently replace it or fall back to browser bookmarks.
- Listen for storage changes so other open new-tab pages refresh their data and layout. Do not overwrite unsaved editor text; show a reload warning when the editor is dirty.
- Export the saved YAML as a local `.yaml` download, preserving comments. Editor/file preview does not persist until Apply.

### Existing-user migration

- Preserve appearance and link-opening settings.
- Do not reuse numeric browser column IDs or old `recent` entries in the custom layout.
- Start an independent custom layout, removing invalid/stale references before rendering.
- Preserve surviving category positions across imports, drop deleted categories, and append new categories to the first available column.
- Ensure empty input and removal of the last category do not crash column verification.
- Keep the existing settings JSON export/import, but validate and restore custom data through the new provider instead of blindly trusting imported custom records. Reset cached roots and refresh settings, data, and columns after import.

## 5. Options and page behavior

Add a Custom bookmarks fieldset to Import/Export with:

1. A `.yaml` / `.yml` file picker that loads text into the editor.
2. A YAML textarea supporting paste and direct editing.
3. Validate/preview and Apply controls.
4. Counts and warnings, plus actionable error messages with line/column where available.
5. Export YAML and Clear list controls; clearing requires confirmation.
6. An indication of unsaved changes.

Do not save on every keystroke or replace data on file selection alone. Keep failed input visible so it can be corrected. Catch file-reading and storage failures explicitly.

Replace browser-folder visibility checkboxes with controls for custom categories; reconcile these controls after each successful import. Give each control an accessible label and keep it out of generic settings initialization until its node exists.

Fresh installations start with a clear empty-state message and an Import bookmarks action opening the correct Options section. Do not silently use personal bookmarks from the repository.

Keep Apps, Most visited, Recently closed, and Other devices as optional features, off by default for a custom-list-first page. Preserve existing explicit user preferences for these features. Removing browser bookmarks does not imply removing these unrelated browser integrations.

## 6. MDI icons and Flame-inspired appearance

### Icons

- Bundle the complete supported MDI icon-name set locally, preferably as a packaged font and stylesheet. This allows future imports to use more than the icons in the current file.
- Verify the chosen package's version, license, and support for names in `flame.yaml` before committing assets.
- Normalize names and validate them against the bundled set; use a generic local link icon for missing/unknown names and report unknown names as warnings.
- Render MDI icons through a dedicated `mdiIcon` property. Do not pass bare MDI names into the existing image URL branch of `getIcon`.
- No icon CDN, remote script, third-party favicon service, or HTML injection.
- Keep icons decorative (`aria-hidden`) and inherit link color for theme compatibility.

### Theme and layout

- Add a selectable `Flame` theme and make it the fresh-install default. Preserve an explicitly saved existing theme.
- Use a dark neutral background, muted text, restrained accent/highlight, and minimal hover glow.
- Style category headings for hierarchy without preventing expansion, keyboard focus, or context menus.
- Retain appearance controls and Custom CSS; do not hardcode theme overrides that prevent user customization.
- Retain Humble's column/folder model. Test narrow-window usability and adjust wrapping/overflow without changing drag target assumptions.
- Keep the first imported list in Humble's initial column layout; users can create and rearrange columns with the existing controls.

## 7. Security, permissions, and privacy

- Remove every `chrome.bookmarks` path and the `bookmarks` permission.
- Remove the Recent bookmarks feature rather than repurposing it with ambiguous date semantics.
- Use text DOM APIs for names/status, not `innerHTML` with YAML content.
- Do not interpolate arbitrary icon names into CSS or asset paths.
- Bundle all parser/icon assets so Manifest V3 CSP and offline icon rendering work without remote code.
- Retain unrelated permissions only where existing optional functionality still uses them. Reassess `favicon` after icon integration; custom bookmarks should not depend on it.
- Keep file-link permissions optional and explain Chrome's Allow access to file URLs setting.
- Explain that imported bookmarks and settings are stored locally, are removed on extension uninstall, and can appear in user-created exports. No telemetry or automatic remote YAML fetch.
- Do not copy personal `flame.yaml` contents into public examples or release assets; use a sanitized example and synthetic test fixtures.

## 8. Implementation sequence

### Phase 1 — Foundation and import model

- Introduce minimal development/test tooling appropriate to a static extension.
- Verify, pin, and locally bundle YAML and MDI dependencies with licenses; avoid an unnecessary framework migration.
- Implement pure parsing/validation/normalization functions and storage handling.
- Add unit tests before wiring the UI.

### Phase 2 — Replace bookmark provider

- Wire custom roots and node lookup into rendering, context menus, column lookup, and open-all-links behavior.
- Remove browser bookmark retrieval, settings callbacks, recent-bookmark controls, and permission.
- Implement custom layout/open-state keys, reconciliation, and migration behavior.
- Handle empty lists, corrupt storage, and cross-tab updates.

### Phase 3 — Import/editor workflow

- Add preview, explicit Apply, file input, YAML export, and clear confirmation.
- Refresh dynamic category controls and preserve unsaved edits across external changes.
- Integrate validated custom records with settings backup/restore.

### Phase 4 — Icons and theme

- Render bundled MDI icons with fallback warnings.
- Add the Flame theme and category styling without replacing Humble interactions.
- Check accessibility, narrow-window behavior, and customization precedence.

### Phase 5 — Verification and documentation

- Run automated tests and static diagnostics.
- Smoke-test the unpacked extension in Chrome/Chromium.
- Update README and privacy policy; document dependency packaging and installation.
- Validate the user's existing `flame.yaml` without modifying it.

## 9. Test plan and acceptance criteria

### Automated checks

- Parse commented YAML, quoted/Unicode names, empty arrays, omitted optional fields, and boolean pinning.
- Preserve fragment/query strings, LAN IPs, ports, `.local` hosts, and allowed special protocols.
- Reject invalid YAML, duplicate mapping keys/names, invalid field types, unsafe protocols, oversized input, and excessive/recursive aliases.
- Handle known, prefixed, missing, and unknown MDI icons.
- Verify stable category IDs through reordering and URL changes.
- Verify replacement removes deleted items, preserves surviving category positions, and cleans stale layout/open-state references.
- Test storage failures, corrupt data, settings restore, and cross-tab updates without overwriting dirty editor text.
- Exercise the page with a browser API mock containing **no `bookmarks` API**; verify no bookmark access is required.

### Browser smoke tests

- Fresh install shows an import action; no personal list or browser bookmark content appears.
- File import and pasted YAML give the same preview and applied list.
- Invalid imports do not lose the previous list; successful imports persist after reload.
- The supplied `flame.yaml` imports all eight categories; every icon resolves or gets an explicit warning and usable fallback.
- Categories expand/collapse, remember explicit closed pinned states, and respect Auto-close folders.
- Dragging categories/columns, creating/removing columns, and hiding/showing categories still work.
- Current-tab, foreground-tab, background-tab, open-all-links, and keyboard navigation behave correctly.
- Export/reimport round-trips bookmarks and comments; settings backup/restore refreshes the custom tree.
- MDI icons render offline with no runtime CDN requests or CSP errors.
- Options and themes remain usable at narrow widths and with large fonts.
- Optional non-bookmark browser sections still function when enabled.

Completion requires passing automated checks and a recorded browser smoke-test result. If browser testing is unavailable, document the unverified checks rather than claiming they passed.

## 10. Deliverables

- New-tab quick-add form with category creation, searchable icon suggestions/preview, and bookmark Edit/Delete context menus.
- Independent Flame-compatible YAML bookmark provider.
- Local import/editor/export workflow with validation and safe persistence.
- Custom-only bookmark rendering with retained Humble interactions.
- Bundled MDI icons and selectable Flame-inspired theme.
- Updated manifest, privacy policy, sanitized example, and usage/development documentation.
- Automated tests and browser verification notes.
