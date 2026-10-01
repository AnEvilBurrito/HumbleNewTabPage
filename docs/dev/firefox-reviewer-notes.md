# Firefox Reviewer Notes

## Reproduce the Build

Use Node.js 24 and npm 11. From the root of the source archive:

```sh
npm ci
npm run stage:firefox
npm run lint:firefox
npm test
```

The runtime extension is staged in `build/firefox`. Upload archives are written
to `build/firefox-release`: `firefox-1.26.3.zip` and
`firefox-1.26.3-source.zip`. The manifest is at the root of the runtime archive.

For Chrome, run `npm run stage:chrome`: the unpackaged runtime is in
`build/chrome` and archives are in `build/chrome-release`. Run
`npm run stage:all` to build both browsers.

The build bundles the YAML parser and copies the MDI font from pinned npm
dependencies. It does not download runtime code. The source package excludes
personal bookmark files, node_modules, generated bundles, and scratch profiles.

## Behavior and Permissions

The extension replaces the desktop Firefox new-tab page. No account or login is
required. YAML bookmarks and appearance settings are stored locally. Use
`docs/example-bookmarks.yaml` as sample import data. The privacy policy is in
`privacy.md`.

The `topSites` permission supports Most visited. The `sessions` permission
supports Recently closed. The `tabs` permission supports tab metadata and link
opening. Chrome-only system-font enumeration and remote-device session listing
are not used in Firefox. Link icons fall back to packaged images; custom MDI
icons are packaged locally. Remote background images are fetched only when
configured by the user. There is no developer-operated telemetry or collection
service.

## Submission

Use the runtime ZIP as the extension upload and the source ZIP for source review.
Select the MIT license, provide the privacy policy and support contact, and
describe the new-tab replacement and local YAML bookmark functionality. Confirm
the extension ID is unique on AMO before the first release; keep it unchanged
for updates. Do not claim Firefox verification until the real-browser checklist
in `firefox-readiness.md` is complete.