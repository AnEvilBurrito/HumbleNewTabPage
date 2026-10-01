Flame × Humble New Tab
=====================

A fork of Humble New Tab Page combining independent Flame-compatible YAML bookmarks, locally bundled Material Design Icons, and a Flame-inspired theme with Humble's draggable columns and collapsible folders.

**Browser bookmarks are never read or modified.** This fork does not require a Flame server.

### Features

- Import a `.yaml` / `.yml` file or paste/edit YAML in Options.
- Quickly add bookmarks and create categories using **Options → Settings → + Add bookmark**, or right-click a category and choose **Add bookmark here**.
- Right-click a bookmark to **Edit** or **Delete** it.
- Choose from 7,448 bundled MDI icons with searchable suggestions and a preview.
- Export your complete custom list back to YAML, including quick-added bookmarks.
- Drag categories/columns or use category context menus to create new columns.
- Customize themes, fonts, spacing, link-opening behavior, and CSS.
- Optional Apps, Most visited, Recently closed, and Other devices sections (off by default).

### Install in Chrome / Chromium

1. Clone or download this fork. The checked-in `assets/` folder contains the runtime dependencies; no build is required to try it.
2. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Select this repository folder, then open a new tab.
4. Open **Options → Import/Export**, choose a YAML file, inspect the preview, and click **Apply list**.

The Chrome/Firefox store versions of upstream Humble do not include this fork's features. This implementation is tested with Chromium Manifest V3; Firefox support has not been verified.

### YAML format

```yaml
categories:
  - name: Work
    pinned: true
    bookmarks:
      - name: Mail
        url: https://mail.example.com/#inbox
        icon: gmail
      - name: Code
        url: https://code.example.com/
        icon: mdi-github
  - name: Reading
    bookmarks: []
```

See [docs/example-bookmarks.yaml](docs/example-bookmarks.yaml) for a sanitized example.

- Categories require `name` and `bookmarks`; bookmarks require `name` and `url`.
- `icon` accepts a bare MDI name or the `mdi-` prefix. Missing/unknown icons use a local link icon; unknown names produce a warning.
- `pinned` defaults to `false` and means **initially expanded**, not locked. Remember open folders preserves explicit open/closed choices.
- Names must be unique within their category; category names must be unique. Names are case-sensitive and trimmed.
- Supported URLs: `http://`, `https://`, `file:///`, and `chrome://`. Chrome file links may require **Allow access to file URLs** in the extension's details.
- Limit: 1 MiB, 200 categories, 10,000 bookmarks. YAML aliases/custom tags and duplicate mapping keys are rejected. Unknown metadata fields are retained in YAML but ignored by rendering, with a warning.

### Import, editing, and backup

**Import replaces the entire custom list**, not just matching names. File selection and typing only change the editor; the saved list changes after Validate / Preview and Apply. Invalid input does not replace the previous list.

Use **Export YAML** before replacing or clearing your list. Original comments are preserved on import/export; quick edits use the YAML syntax tree to retain surrounding comments and metadata, although formatting may change. Export Settings also backs up the custom YAML, layout, and appearance settings.

Apply or reload unsaved YAML edits before using quick-add/Edit/Delete. Other open new-tab pages refresh automatically, and stale forms are rejected rather than overwriting newer changes.

Bookmarks remain local to this browser profile. The extension does not watch the imported file, update that file, synchronize with Flame, or load the repository's personal `flame.yaml` automatically. Extension removal clears its local storage, so keep exports if you need a durable backup.

The main page shows only bookmark categories and links, without an action toolbar. Add/import controls are available through Options (the top-right icon).

Fresh installs use the Flame theme and show category headings. Existing explicit appearance/link-opening preferences are preserved; old browser bookmark layouts are not reused. For a multi-column layout, right-click a category and choose **Create new column**, or drag categories to column edges.

### Development and testing

Requires Node.js 24 or newer for the current development dependencies.

```sh
npm ci
npm run build
npm test
```

`build` regenerates runtime assets from pinned `yaml` and `@mdi/font` dependencies. Commit regenerated `assets/` together with source changes. There are no runtime CDN dependencies or framework requirements.

For a real unpacked-extension smoke test, first install Playwright Chromium inside the workspace:

```sh
# Git Bash / Unix shells
PLAYWRIGHT_BROWSERS_PATH=.tmp/browsers npx playwright install chromium
npm run test:browser
```

```powershell
# PowerShell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.tmp/browsers"
npx playwright install chromium
npm run test:browser
```

Test profiles, browser binaries, downloads, and screenshots stay in `.tmp/`, which is ignored. See [docs/implementation-plan.md](docs/implementation-plan.md) and [docs/verification.md](docs/verification.md).

### Licenses

The fork retains Humble's MIT license. Bundled YAML uses the ISC license; MDI uses the Pictogrammers Free License (font/icons Apache 2.0, code MIT). License notices are included under `assets/`.

Upstream screenshots (before this fork)
--------------------------------------
![](media/shot.2.png)
![](media/shot.3.png)
![](media/shot.4.png)
![](media/shot.5.png)


License
-------

This project is licensed under the **MIT License**, see [LICENSE_MIT.txt](LICENSE_MIT.txt) for details.


Changelog
---------

### Version 1.26.2 - April 9, 2025

- (Firefox) Removed Favicon Kit and Qwant favicon providers, added Ecosia and Icon Horse

### Version 1.26.1 - October 15, 2023

- (Chrome) Fixed navigating to file:/// URLs (enable "Allow access to file URLs" in Manage Extensions > Details)
- (Vivaldi) Hide bookmark separators

### Version 1.26 - July 2, 2023

- Added font-weight option
- (Chrome) Replaced Apps folder with a link to chrome://apps
- (Firefox) Set home page to new tab page (change in Firefox settings)
- (Firefox) Updated Google favicon provider

### Version 1.25 - March 11, 2023

- Manifest V3
- Updated favicon
- (Firefox) Added Qwant and Yandex favicon providers

### Version 1.24.2 - February 21, 2020

- (Firefox) Added DuckDuckGo favicon provider

### Version 1.24.1 - May 14, 2019

- (Firefox) Set addon ID for consistent page URL

### Version 1.24 - February 10, 2019

- Temporarily disabled weather feature
- Improved keyboard navigation
- Fixed bug opening options
- (Firefox) Changed extension name to HNTP
- (Firefox) Fixed broken favicons
- (Firefox) Fixed context menu not opening

### Version 1.23.3 - December 3, 2018

- (Firefox) Fixed folder closing animation

### Version 1.23.1 - December 2, 2018

- (Firefox) Removed unused "management" permission

### Version 1.23 - December 2, 2018

- Added tooltips for truncated text
- Added option to remember open folders
- (Firefox) Added option for favicon provider

### Version 1.22 - October 15, 2017

- Firefox support

### Version 1.21 - November 20, 2016

- Added HiDPI icons
- Fixed export settings not selectable

### Version 1.20 - June 1, 2016

- Added import/export settings
- Fixed recently closed max items

### Version 1.19 - April 14, 2016

- Fixed weather not updating

### Version 1.18 - April 3, 2016

- Removed geolocation
- Fixed weather error

### Version 1.17 - January 24, 2016

- Fixed weather error

### Version 1.16 - August 29, 2014

- Added other devices folder
- Recently closed tabs preserve history
- Removed background process
- Chrome version 37 or later required

### Version 1.15 - July 6, 2014

- Fixed freezing issues

### Version 1.14 - May 11, 2014

- Reduced memory usage
- Added option to set number of items for recently closed, recent bookmarks, and most visited
- Added option for background image size
- Added link to bookmark manager in folder context menu

### Version 1.12 - August 18, 2013

- Reorder apps via drag and drop

### Version 1.11 - August 3, 2013

- Fixed launching packaged apps (Google Keep)
- Fixed launching file:/// and chrome:// URLs
- Fixed Mobile Bookmarks folder not being removable
- Disable weather if geolocation is denied
- Default layout changed to 2 columns
- Uninstall apps from the context menu
- Hide Google Wallet Service from apps

### Version 1.9 - December 30, 2012

- Uses geolocation for weather by default
- Fixed bug with drag and drop
- Added Chrome Web Store to apps

### Version 1.8 - November 9, 2012

- Redesigned options panel
- Added several new settings
- Performance tweaks
- Source code released under the MIT license

### Version 1.7 - September 8, 2012

- Added custom CSS field for advanced users
- Added option to hide Bookmarks bar and Other bookmarks

### Version 1.6 - August 30, 2012

- Added option to open links in new tabs
- Support local file for background image
- Weather errors fixed

### Version 1.5 - August 29, 2012

- Weather forecast now uses Yahoo
- System font list enabled on supported versions

### Version 1.4 - August 10, 2012

- Added option to disable the weather and other special folders
- Minor bug fixes

### Version 1.3 - August 9, 2012

- Fixed error on old Chrome versions

### Version 1.2 - August 8, 2012

- Added apps, most visited, recently closed, and weather
- More flexible layout with unlimited columns
- Open all links in folder from context menu
- Color themes and new default style
- Added smooth animation and highlight shadow
- Drag and drop to reorder folders and columns
- Background image support
- Bug fixes
- New name (formerly New Tab + Bookmark Tree)

### Version 1.1 - July 20, 2011

- Added options menu

### Version 1.0 - July 17, 2011

- Initial release
