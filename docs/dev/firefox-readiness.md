# Firefox Upload Checklist

Work through these items in order. A checked item means locally verified, not
approval or signing by Mozilla.

- [x] Add a Firefox package manifest with a stable MV3 extension ID and the
  required data-collection declaration; omit Chrome-only permissions.
- [x] Guard unsupported Other devices functionality and hide its Firefox control.
- [x] Use a local fallback for non-custom icons on Firefox.
- [x] Generate an allowlisted runtime ZIP and a reproducible source ZIP, excluding
  personal flame.yaml data, dependencies, and development artifacts.
- [x] Pass the existing tests and Firefox package validation with web-ext lint
  (zero errors; warnings documented below).
- [ ] Exercise the packaged extension in real Firefox: new-tab override, YAML
  import/export, editing, settings, persistence, optional sections, and icons.
- [ ] Prepare AMO listing details, privacy policy, reviewer build instructions,
  and submit the runtime and source packages for Mozilla signing/review.

## Release Decisions

The Firefox ID must remain unchanged for future releases. The proposed ID is
`flame-humble-new-tab@humble-new-tab`; AMO must confirm uniqueness. The local-only
implementation declares `required: ["none"]`. Reassess that declaration if data
collection or transmission is introduced.

## Verification Log

Verified locally on 2026-10-01:

- Firefox package build succeeds with 7,448 bundled MDI icons.
- All 31 provider and page tests pass, including unavailable devices API and
  Firefox local-icon regression coverage.
- web-ext lint: zero errors, zero notices, five warnings. Four warnings identify
  guarded Chrome-only getDevices/fontSettings references in shared code. One
  flags Android data-consent support at minimum version 140. The release targets
  desktop Firefox only (no gecko_android key); desktop consent support starts
  at 140. These warnings are not evidence of full Firefox workflow verification.
- Installed the staged runtime as a temporary add-on in installed Firefox using
  a disposable headless profile. Full interactive workflows remain unchecked.
- Reviewer build/submission instructions are in firefox-reviewer-notes.md.
- Generated archives: build/firefox-release/firefox-1.26.3.zip and
  build/firefox-release/firefox-1.26.3-source.zip.

## Remaining Release Gates

- [ ] Verify new-tab override, import/export, quick edits, settings, reload and
  restart persistence, Most visited, Recently closed, and local icons in Firefox.
- [ ] Review lint warnings before submission and confirm the privacy declaration.
- [ ] Confirm AMO ID uniqueness and supply listing text, screenshots, support
  contact, privacy policy, and reviewer notes; upload both archives.

AMO signing/review and account-specific listing information require the publisher.
No upload or signing has been performed.