'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const vm = require('node:vm');
const M = require('../custom-bookmarks');
const sample = '# Keep this comment\ncategories:\n  - name: Work\n    pinned: true\n    bookmarks:\n      - name: Mail\n        url: https://example.com/#inbox\n        icon: gmail\n  - name: Reading\n    bookmarks: []\n';
function page(source, setup) {
  const dom = new JSDOM(fs.readFileSync('newtab.html', 'utf8'), { url: 'https://extension.test/newtab.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  w.confirm = () => true;
  w.alerts = [];
  w.alert = message => w.alerts.push(message);
  w.chrome = { sessions: { onChanged: { addListener() {} }, getRecentlyClosed: (opts, cb) => cb([]), getDevices: (opts, cb) => cb([]) },
    tabs: { getCurrent: cb => cb({id: 1}), create() {}, update() {} } };
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new w.Event('close')); };
  if (source) w.localStorage.setItem(M.DATA_KEY, JSON.stringify({version: 1, source}));
  if (setup) setup(w);
  for (const script of ['assets/custom-bookmarks.bundle.js', 'newtab.js', 'custom-bookmarks-ui.js']) vm.runInContext(fs.readFileSync(script, 'utf8'), dom.getInternalVMContext(), {filename: script});
  const get = id => w.document.getElementById(id);
  return { dom, w, get, close: () => w.close() };
}
function input(app, id, value) {
  app.get(id).value = value;
  app.get(id).dispatchEvent(new app.w.Event('input', {bubbles: true}));
}
function submit(app) { app.get('bookmark_form').dispatchEvent(new app.w.Event('submit', {cancelable: true})); }

test('fresh page and options initialize without any browser bookmarks API', () => {
  const p = page();
  assert.ok(p.w.document.querySelector('.empty-state'));
  assert.equal(p.w.columns.length, 0);
  p.get('import_bookmarks').click();
  assert.equal(p.get('options').style.display, 'block');
  assert.equal(p.w.document.querySelectorAll('#options .section')[2].classList.contains('current'), true);
  assert.equal(p.get('bookmark_yaml').value, M.EMPTY_YAML);
  assert.equal(p.get('options_show_recent'), null);
  p.close();
});

test('full-size bookmark actions remain in Options and closing the form restores visible focus', () => {
  const p = page(sample);
  assert.equal(p.get('page_actions'), null);
  assert.equal(p.get('add_bookmark').closest('#options'), p.get('options'));
  assert.equal(p.get('import_bookmarks').closest('#options'), p.get('options'));
  p.w.showOptions(true);
  p.get('add_bookmark').focus();
  p.get('add_bookmark').click();
  assert.equal(p.get('options').style.display, 'none');
  assert.equal(p.get('bookmark_dialog').open, true);
  p.get('bookmark_cancel').click();
  assert.equal(p.w.document.activeElement, p.get('options_button'));
  const addHere = p.w.getMenuItems(p.w.bookmarks.categories[0]).find(item => item.label === 'Add bookmark here');
  addHere.action();
  assert.equal(p.get('bookmark_dialog').open, true);
  assert.equal(p.get('bookmark_category').value, M.categoryId('Work'));
  p.close();
});

test('icon shortcuts are labeled native buttons and reuse existing add/import flows', () => {
  const p = page(sample);
  const add = p.get('quick_add_bookmark'), imports = p.get('quick_import_bookmarks');
  assert.equal(p.get('page_actions'), null);
  for (const [button, label] of [[add, 'Add bookmark'], [imports, 'Import YAML']]) {
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.getAttribute('aria-label'), label);
    assert.equal(button.title, label);
    assert.equal(button.closest('#page_shortcuts'), p.get('page_shortcuts'));
    assert.equal(button.closest('#options'), null);
    assert.ok(button.querySelector('[aria-hidden="true"]').textContent);
  }
  add.focus();
  add.click();
  assert.equal(p.get('bookmark_dialog').open, true);
  assert.equal(p.get('options').style.display, 'none');
  p.get('bookmark_cancel').click();
  assert.equal(p.w.document.activeElement, add);
  imports.click();
  assert.equal(p.get('options').style.display, 'block');
  assert.equal(p.w.document.querySelectorAll('#options .section')[2].classList.contains('current'), true);
  assert.equal(p.w.document.activeElement, p.get('bookmark_yaml'));
  p.close();
});

test('hide setting targets all shortcut icons without changing the bookmark margin', () => {
  const p = page(sample);
  const before = p.w.getStyle('v_margin', 1);
  p.w.setConfig('hide_options', 1);
  assert.equal(p.w.styles.hide_options.innerText, '#page_shortcuts .shortcut-button { opacity: 0; }');
  assert.equal(p.w.getStyle('v_margin', 1), before);
  p.w.setConfig('hide_options', 0);
  assert.equal(p.w.styles.hide_options, undefined);
  p.close();
});

test('explicit preview/apply saves valid imports and leaves invalid input intact', () => {
  const p = page(sample);
  input(p, 'bookmark_yaml', 'categories: null');
  p.get('bookmark_validate').click();
  assert.equal(p.get('bookmark_apply').disabled, true);
  assert.equal(p.get('bookmark_yaml').value, 'categories: null');
  assert.equal(p.w.bookmarkStore.load().count, 1);
  input(p, 'bookmark_yaml', 'categories: [{name: New, pinned: true, bookmarks: [{name: Docs, url: https://docs.example/}]}]');
  assert.equal(p.get('bookmark_apply').disabled, true);
  p.get('bookmark_validate').click();
  assert.equal(p.get('bookmark_apply').disabled, false);
  p.get('bookmark_apply').click();
  assert.equal(p.w.bookmarks.categories[0].title, 'New');
  assert.equal(p.w.bookmarkEditorDirty(), false);
  assert.ok(p.w.document.querySelector('#main a[href="https://docs.example/"]'));
  p.close();
});

test('pinned explicit closed state survives re-render; remember-off uses YAML default', async () => {
  const p = page(sample);
  const category = p.w.document.querySelector('#main .category');
  assert.equal(category.open, true);
  category.click();
  await new Promise(resolve => setTimeout(resolve, 230));
  p.w.loadColumns();
  assert.equal(p.w.document.querySelector('#main .category').open, undefined);
  assert.equal(p.w.localStorage.getItem(M.OPEN_PREFIX + M.categoryId('Work')), '0');
  p.w.setConfig('remember_open', 0);
  assert.equal(p.w.document.querySelector('#main .category').open, true);
  p.close();
});

test('quick add creates a category, edits/moves, deletes, and updates export source', () => {
  const p = page(sample);
  p.get('add_bookmark').click();
  assert.equal(p.get('bookmark_dialog').open, true);
  input(p, 'bookmark_url', 'http://homeassistant.local:8123/');
  input(p, 'bookmark_name', 'Home');
  p.get('bookmark_category').value = '';
  p.get('bookmark_category').dispatchEvent(new p.w.Event('change'));
  input(p, 'bookmark_new_category', 'Local');
  input(p, 'bookmark_icon', 'home-assistant');
  submit(p);
  assert.equal(p.get('bookmark_dialog').open, false);
  assert.equal(p.w.bookmarks.count, 2);
  assert.match(p.w.bookmarks.source, /# Keep this comment/);
  p.w.showBookmarkForm(p.w.bookmarks.nodes.get(M.bookmarkId('Local', 'Home')));
  input(p, 'bookmark_name', 'Home Assistant');
  p.get('bookmark_category').value = M.categoryId('Work');
  submit(p);
  assert.equal(p.w.bookmarks.nodes.get(M.bookmarkId('Work', 'Home Assistant')).url, 'http://homeassistant.local:8123/');
  p.w.deleteBookmark(p.w.bookmarks.nodes.get(M.bookmarkId('Work', 'Home Assistant')));
  assert.equal(p.w.bookmarks.count, 1);
  assert.equal(M.parse(p.get('bookmark_yaml').value).count, 1);
  p.close();
});

test('duplicate quick add and unsafe URLs do not commit or dismiss the form', () => {
  const p = page(sample);
  p.get('add_bookmark').click();
  input(p, 'bookmark_name', 'Mail');
  input(p, 'bookmark_url', 'https://other.example/');
  submit(p);
  assert.match(p.get('bookmark_form_status').textContent, /already exists/);
  input(p, 'bookmark_name', 'Bad');
  input(p, 'bookmark_url', 'javascript:alert(1)');
  submit(p);
  assert.match(p.get('bookmark_form_status').textContent, /allowed/);
  assert.equal(p.get('bookmark_dialog').open, true);
  assert.equal(p.w.bookmarks.count, 1);
  p.close();
});

test('dirty YAML blocks quick edits; cross-tab changes preserve text and reject stale apply', () => {
  const p = page(sample);
  input(p, 'bookmark_yaml', 'categories: []\n# unsaved');
  p.get('add_bookmark').click();
  assert.equal(p.get('bookmark_dialog').open, false);
  assert.equal(p.w.alerts.length, 1);
  p.w.localStorage.setItem(M.DATA_KEY, JSON.stringify({version: 1, source: M.EMPTY_YAML}));
  p.w.dispatchEvent(new p.w.StorageEvent('storage', { key: M.DATA_KEY, storageArea: p.w.localStorage }));
  assert.equal(p.get('bookmark_yaml').value, 'categories: []\n# unsaved');
  assert.equal(p.get('bookmark_apply').disabled, true);
  p.get('bookmark_validate').click();
  p.get('bookmark_apply').click();
  assert.match(p.get('bookmark_status').textContent, /another tab/);
  assert.equal(p.w.bookmarkStore.load().source, M.EMPTY_YAML);
  p.close();
});

test('stale quick-edit form refuses to overwrite external changes', () => {
  const p = page(sample);
  p.get('add_bookmark').click();
  input(p, 'bookmark_name', 'Docs');
  input(p, 'bookmark_url', 'https://docs.example/');
  p.w.bookmarkStore.save(M.EMPTY_YAML);
  submit(p);
  assert.match(p.get('bookmark_form_status').textContent, /another tab/);
  assert.equal(p.w.bookmarkStore.load().count, 0);
  p.close();
});

test('category visibility, column movement and removal of the last category are safe', () => {
  const p = page(sample);
  p.w.showOptions(true);
  const work = M.categoryId('Work'), reading = M.categoryId('Reading');
  p.w.addColumn([reading]);
  assert.equal(p.w.columns.length, 2);
  p.w.addRow(reading, 0, 0);
  assert.equal(p.w.columns.length, 1);
  assert.equal(p.w.columns[0][0], reading);
  p.w.setConfig('show_' + work, 0);
  assert.equal(p.w.columns.flat().includes(work), false);
  p.w.setConfig('show_' + work, 1);
  assert.equal(p.w.columns.flat().includes(work), true);
  p.get('bookmark_clear').click();
  assert.equal(p.w.columns.length, 0);
  assert.ok(p.w.document.querySelector('.empty-state'));
  assert.equal(p.get('options_show_categories').children.length, 0);
  p.close();
});

test('corrupt saved data is preserved with recovery guidance; settings import refreshes tree', () => {
  const p = page(null, w => w.localStorage.setItem(M.DATA_KEY, '{corrupt'));
  assert.match(p.get('page_status').textContent, /Unable/);
  assert.equal(p.w.localStorage.getItem(M.DATA_KEY), '{corrupt');
  p.get('add_bookmark').click();
  assert.equal(p.get('bookmark_dialog').open, false);
  assert.equal(p.get('bookmark_yaml').value, '{corrupt');
  p.get('bookmark_clear').click();
  assert.equal(p.get('page_status').hidden, true);
  p.get('options_import').value = JSON.stringify({[M.DATA_KEY]: JSON.stringify({version: 1, source: sample})});
  p.get('options_import').dispatchEvent(new p.w.Event('change'));
  assert.equal(p.w.bookmarks.count, 1);
  assert.equal(p.get('options_show_categories').children.length, 2);
  p.close();
});

test('legacy numeric layout and recent references never reach the custom provider', () => {
  const p = page(sample, w => {
    w.localStorage.setItem('column.0.0', '1');
    w.localStorage.setItem('column.0.1', 'recent');
    w.localStorage.setItem(M.LAYOUT_KEY, JSON.stringify([['1', 'recent', M.categoryId('Work')], ['missing']]));
  });
  assert.equal(p.w.getConfig('theme'), 'Default');
  assert.deepEqual(Array.from(p.w.columns.flat()), [M.categoryId('Work'), M.categoryId('Reading')]);
  assert.equal(p.w.localStorage.getItem('column.0.0'), '1');
  p.close();
});

test('fresh Flame default survives later saved preferences and reload', () => {
  const first = page();
  assert.equal(first.w.getConfig('theme'), 'Flame');
  first.w.setConfig('newtab', 2);
  const saved = Object.fromEntries(Object.keys(first.w.localStorage).map(key => [key, first.w.localStorage.getItem(key)]));
  first.close();
  const second = page(null, w => {
    for (const [key, value] of Object.entries(saved)) w.localStorage.setItem(key, value);
  });
  assert.equal(second.w.getConfig('theme'), 'Flame');
  assert.equal(second.w.getConfig('newtab'), 2);
  second.close();
});

test('replacement persists reconciled layout and removes deleted category state', () => {
  const p = page(sample);
  const work = M.categoryId('Work'), reading = M.categoryId('Reading');
  p.w.addColumn([reading]);
  p.w.localStorage.setItem(M.OPEN_PREFIX + reading, '0');
  p.w.setConfig('show_' + reading, 0);
  p.w.bookmarkStore.save('categories: [{name: Work, pinned: true, bookmarks: []}]');
  p.w.refreshAfterBookmarkChange();
  const layout = JSON.parse(p.w.localStorage.getItem(M.LAYOUT_KEY));
  assert.deepEqual(layout, [[work]]);
  assert.equal(p.w.localStorage.getItem(M.OPEN_PREFIX + reading), null);
  assert.equal(p.w.localStorage.getItem('options.show_' + reading), null);
  p.close();
});

test('optional browser sections and link-opening preferences work without bookmarks', () => {
  const p = page();
  p.w.chrome.topSites = {get: cb => cb([{title: 'Site', url: 'https://top.example/'}])};
  p.w.setConfig('show_top', 1);
  assert.equal(p.w.columns[0][0], 'top');
  assert.equal(p.w.document.querySelector('.empty-state'), null);
  p.w.document.querySelector('#main .top').click();
  assert.ok(p.w.document.querySelector('#main a[href="https://top.example/"]'));
  p.w.setConfig('show_root', 0);
  assert.ok(p.w.document.querySelector('#main a[href="https://top.example/"]'));
  p.w.setConfig('show_apps', 1);
  assert.ok(p.w.document.querySelector('#main a[href="chrome://apps"]'));
  p.w.setConfig('show_apps', 0);
  p.w.setConfig('show_closed', 1);
  p.w.refreshClosed();
  p.w.setConfig('show_devices', 1);
  p.w.document.querySelector('#main .devices').click();
  p.w.bookmarkStore.save(sample);
  p.w.refreshAfterBookmarkChange();
  const opened = [], updated = [];
  p.w.chrome.tabs.create = value => opened.push(value);
  p.w.chrome.tabs.update = (id, value) => updated.push({id, ...value});
  const mail = p.w.bookmarks.categories[0].children[0];
  p.w.openLink(mail, 0);
  p.w.openLink(mail, 1);
  p.w.openLink(mail, 2);
  p.w.openLinks(p.w.bookmarks.categories[0]);
  assert.equal(updated[0].id, 1);
  assert.equal(opened[0].active, true);
  assert.equal(opened[1].active, false);
  assert.equal(opened[2].url, mail.url);
  p.close();
});

test('custom CSS stays last after theme/appearance changes', () => {
  const p = page(sample);
  p.w.setConfig('css', '#main a { color: red; }');
  p.w.setConfig('font_color', '#123456');
  assert.equal(p.w.document.head.lastElementChild, p.w.styles.css);
  p.w.setConfig('theme', 'Classic');
  assert.equal(p.w.document.head.lastElementChild, p.w.styles.css);
  assert.equal(p.w.document.body.dataset.theme, 'Classic');
  p.close();
});

test('bookmark names render as text and folders support keyboard activation', () => {
  const source = 'categories: [{name: "<script>bad</script>", pinned: true, bookmarks: [{name: "<img src=x onerror=bad>", url: https://example.com/}]}]';
  const p = page(source);
  assert.equal(p.w.document.querySelector('#main script'), null);
  assert.equal(p.w.document.querySelector('#main img'), null);
  const folder = p.w.document.querySelector('#main .category');
  assert.equal(folder.getAttribute('role'), 'button');
  folder.dispatchEvent(new p.w.KeyboardEvent('keydown', {key: ' ', cancelable: true}));
  assert.equal(folder.getAttribute('aria-expanded'), 'false');
  p.close();
});
