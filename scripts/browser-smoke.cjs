'use strict';
// Real unpacked MV3 extension smoke test. Scratch profiles/screenshots stay in .tmp.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('.tmp/browsers');
const { chromium } = require('@playwright/test');
const M = require('../custom-bookmarks');
const source = '# Smoke test list\ncategories:\n  - name: Work\n    pinned: true\n    bookmarks:\n      - name: Mail\n        url: https://mail.example.com/#inbox\n        icon: gmail\n      - name: Code\n        url: https://code.example.com/\n        icon: github\n  - name: Reading\n    pinned: true\n    bookmarks:\n      - name: News\n        url: https://news.example.com/\n        icon: newspaper\n';

async function openOptionsAction(page, id) {
  await page.locator('#options_button').click();
  await page.locator('#options_nav a').filter({hasText: /^Settings$/}).click();
  await page.locator('#' + id).click();
}

async function main() {
  fs.mkdirSync('.tmp', { recursive: true });
  const profile = fs.mkdtempSync(path.resolve('.tmp/smoke-profile-'));
  const extension = process.cwd();
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: {width: 1280, height: 900},
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run']
  });
  const errors = [];
  const remoteRequests = [];
  context.on('request', request => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  let page;
  try {
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto('chrome://newtab/');
    await page.locator('#options_button').waitFor();
    assert.equal(await page.locator('#page_actions').count(), 0);
    assert.equal(await page.locator('#add_bookmark').isVisible(), false);
    assert.equal(await page.locator('#import_bookmarks').isVisible(), false);
    const extensionUrl = await page.evaluate(() => location.href);
    assert.match(extensionUrl, /^chrome-extension:/);
    assert.equal(await page.evaluate(() => chrome.runtime.getManifest().permissions.includes('bookmarks')), false);
    assert.equal(await page.evaluate(() => document.body.dataset.theme), 'Flame');
    await page.locator('.empty-state').waitFor();

    // Import is accessible in Options; no action row is shown above bookmarks.
    await openOptionsAction(page, 'import_bookmarks');
    await page.locator('#bookmark_file').setInputFiles({name: 'bookmarks.yaml', mimeType: 'application/yaml', buffer: Buffer.from(source)});
    await page.waitForFunction(() => !document.getElementById('bookmark_apply').disabled);
    assert.equal(await page.evaluate(() => bookmarks.count), 0);
    await page.locator('#bookmark_apply').click();
    assert.equal(await page.evaluate(() => bookmarks.count), 3);
    await page.reload();
    await page.locator('#main a[href="https://mail.example.com/#inbox"]').waitFor();
    assert.equal(await page.evaluate(() => bookmarks.count), 3);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Material Design Icons"')), true);
    await page.screenshot({path: '.tmp/flame-desktop.png', fullPage: true});

    // Pinned category can stay closed after reload.
    await page.locator('#main .category').first().click();
    await page.waitForTimeout(250);
    await page.reload();
    assert.equal(await page.locator('#main .category').first().getAttribute('aria-expanded'), 'false');
    await page.locator('#main .category').first().click();
    await page.waitForTimeout(250);

    // Add from Options, with searchable local MDI icon preview.
    await openOptionsAction(page, 'add_bookmark');
    assert.equal(await page.locator('#options').isVisible(), false);
    await page.locator('#bookmark_url').fill('http://homeassistant.local:8123/');
    await page.locator('#bookmark_name').fill('Home');
    await page.locator('#bookmark_category').selectOption('');
    await page.locator('#bookmark_new_category').fill('Local');
    await page.locator('#bookmark_icon').fill('home-assistant');
    await page.locator('#bookmark_form button[type=submit]').click();
    assert.equal(await page.evaluate(() => bookmarks.count), 4);
    await page.locator('#main a[href="http://homeassistant.local:8123/"]').waitFor();

    // Real context menu Edit/Delete; form keyboard focus and cancellation.
    await page.locator('#main a[href="http://homeassistant.local:8123/"]').click({button: 'right'});
    await page.locator('.menu a', {hasText: 'Edit bookmark'}).click();
    await page.locator('#bookmark_name').fill('Home Assistant');
    await page.locator('#bookmark_form button[type=submit]').click();
    assert.equal(await page.evaluate(() => bookmarks.nodes.has(CustomBookmarks.bookmarkId('Local', 'Home Assistant'))), true);
    await page.locator('#main a[href="http://homeassistant.local:8123/"]').click({button: 'right'});
    await page.locator('.menu a', {hasText: 'Delete bookmark'}).click();
    assert.equal(await page.evaluate(() => bookmarks.count), 3);

    // Category menu creates columns; HTML drag/drop moves a category back.
    await page.locator('#main .category').filter({hasText: 'Reading'}).click({button: 'right'});
    await page.locator('.menu a', {hasText: 'Create new column'}).click();
    assert.equal(await page.locator('#main .column').count(), 2);
    const reading = page.locator('#main .category').filter({hasText: 'Reading'});
    const work = page.locator('#main .category').filter({hasText: 'Work'});
    await reading.dragTo(work);
    assert.equal(await page.evaluate(() => columns.length), 1);
    await page.reload();
    assert.equal(await page.evaluate(() => columns.length), 1);

    // Cross-tab refresh keeps dirty editor text and rejects stale quick-edit form.
    const other = await context.newPage();
    other.on('pageerror', error => errors.push(error.message));
    other.on('dialog', dialog => dialog.accept());
    await other.goto(extensionUrl);
    await openOptionsAction(other, 'import_bookmarks');
    await other.locator('#bookmark_yaml').fill(source + '# unsaved editor\n');
    await openOptionsAction(page, 'add_bookmark');
    await other.evaluate(() => {
      bookmarkStore.upsert({category: 'Work', name: 'External', url: 'https://external.example/'});
    });
    await page.waitForFunction(() => bookmarks.count === 4);
    await page.locator('#bookmark_url').fill('https://stale.example/');
    await page.locator('#bookmark_name').fill('Stale');
    await page.locator('#bookmark_form button[type=submit]').click();
    assert.match(await page.locator('#bookmark_form_status').textContent(), /another tab/);
    await page.locator('#bookmark_cancel').click();
    await page.evaluate(() => bookmarkStore.upsert({category: 'Work', name: 'New', url: 'https://new.example/'}));
    await other.waitForFunction(() => document.getElementById('bookmark_status').textContent.includes('another tab'));
    assert.equal(await other.locator('#bookmark_yaml').inputValue(), source + '# unsaved editor\n');
    await other.close();
    await page.reload();

    // Invalid YAML leaves previous source intact; exported YAML includes quick changes.
    await openOptionsAction(page, 'import_bookmarks');
    await page.locator('#bookmark_yaml').fill('categories: null');
    await page.locator('#bookmark_validate').click();
    assert.equal(await page.locator('#bookmark_apply').isDisabled(), true);
    assert.equal(await page.evaluate(() => bookmarks.count), 5);
    await page.locator('#bookmark_reload').click();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#bookmark_export').click();
    const download = await downloadEvent;
    await download.saveAs('.tmp/exported-bookmarks.yaml');
    const exported = fs.readFileSync('.tmp/exported-bookmarks.yaml', 'utf8');
    assert.equal(M.parse(exported).count, 5);
    assert.match(exported, /# Smoke test list/);

    // Theme customization, narrow Options and modal, offline icons.
    await page.locator('#options_nav a').filter({hasText: 'Appearance'}).click();
    await page.locator('#options_theme').selectOption('Classic');
    assert.equal(await page.evaluate(() => document.body.dataset.theme), 'Classic');
    await page.locator('#options_theme').selectOption('Flame');
    await page.locator('#options_close_button').click();
    await page.setViewportSize({width: 390, height: 844});
    await openOptionsAction(page, 'import_bookmarks');
    await page.screenshot({path: '.tmp/flame-options-mobile.png', fullPage: true});
    assert.ok(await page.locator('#bookmark_yaml').isVisible());
    const optionsBox = await page.locator('#options').boundingBox();
    assert.ok(optionsBox.width <= 391);
    await page.locator('#options_close_button').click();
    await context.setOffline(true);
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Material Design Icons"')), true);
    await openOptionsAction(page, 'add_bookmark');
    await page.screenshot({path: '.tmp/flame-add-mobile.png', fullPage: true});
    await page.locator('#bookmark_cancel').click();
    await context.setOffline(false);

    // Optional integrations remain usable with their real Chrome APIs.
    await page.setViewportSize({width: 1280, height: 900});
    await page.evaluate(() => {
      setConfig('show_top', 1);
      setConfig('show_closed', 1);
      setConfig('show_devices', 1);
      setConfig('show_apps', 1);
    });
    for (const name of ['top', 'closed', 'devices']) {
      await page.locator('#main .' + name).click();
      await page.waitForTimeout(100);
    }
    await page.locator('#main a[href="chrome://apps"]').waitFor();
    await page.evaluate(() => {
      for (const name of ['top', 'closed', 'devices', 'apps']) setConfig('show_' + name, 0);
    });

    // Settings backup restores the custom provider, not stale cached roots.
    await openOptionsAction(page, 'import_bookmarks');
    const backup = await page.locator('#options_export').inputValue();
    await page.locator('#bookmark_clear').click();
    assert.equal(await page.evaluate(() => bookmarks.count), 0);
    await page.locator('#options_import').fill(backup);
    await page.locator('#options_import').dispatchEvent('change');
    assert.equal(await page.evaluate(() => bookmarks.count), 5);
    await page.locator('#options_close_button').click();

    // The user's private file is an optional local compatibility check, never a fixture or default.
    if (fs.existsSync('flame.yaml')) {
      const personal = M.parse(fs.readFileSync('flame.yaml', 'utf8'));
      await openOptionsAction(page, 'import_bookmarks');
      await page.locator('#bookmark_file').setInputFiles('flame.yaml');
      await page.waitForFunction(() => !document.getElementById('bookmark_apply').disabled);
      await page.locator('#bookmark_apply').click();
      assert.equal(await page.evaluate(() => bookmarks.count), personal.count);
      assert.equal(await page.evaluate(() => bookmarks.categories.length), personal.categories.length);
      console.log(`Local flame.yaml browser check: ${personal.categories.length} categories, ${personal.count} bookmarks, ${personal.warnings.length} warnings.`);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, [], 'Custom bookmarks must not fetch third-party icons or scripts.');
    console.log('PASS: unpacked MV3 extension, YAML import, persistence, quick add/edit/delete, context menus, drag/drop, cross-tab conflicts, YAML/settings export/restore, themes, optional browser APIs, narrow UI, offline icons; no page errors or remote runtime requests.');
  } catch (error) {
    if (page) await page.screenshot({path: '.tmp/smoke-failure.png', fullPage: true}).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
