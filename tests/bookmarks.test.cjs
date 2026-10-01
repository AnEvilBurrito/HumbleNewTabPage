'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../custom-bookmarks');
const sample = '# My list\ncategories:\n  - name: Work\n    pinned: true\n    bookmarks:\n      - name: Mail\n        url: https://example.com/?x=1&y=2#inbox\n        icon: mdi-gmail\n';
function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('parses Flame structure, comments, defaults, fragments, and prefixed icons', () => {
  const p = M.parse(sample);
  assert.equal(p.categories[0].pinned, true);
  assert.equal(p.categories[0].children[0].url, 'https://example.com/?x=1&y=2#inbox');
  assert.equal(p.categories[0].children[0].mdiIcon, 'gmail');
  assert.equal(p.source, sample);
  assert.deepEqual(p.warnings, []);
  assert.equal(M.parse('categories: [{name: 空, bookmarks: []}]').categories[0].pinned, false);
  assert.equal(M.parse('categories: []').count, 0);
});

test('validates shape, duplicate names/keys and unsafe URLs', () => {
  for (const source of ['', 'categories: null', 'categories: []\ncategories: []',
    'categories: [{name: x, bookmarks: [], pinned: yes}]',
    'categories: [{name: x, bookmarks: []}, {name: x, bookmarks: []}]',
    'categories: [{name: x, bookmarks: [{name: y, url: https://x/}, {name: y, url: https://y/}]}]',
    sample.replace('name: Mail', 'name: 42'), sample.replace('icon: mdi-gmail', 'icon: 42'),
    sample.replace('https://example.com/?x=1&y=2#inbox', 'javascript:alert(1)'),
    sample.replace('https://example.com/?x=1&y=2#inbox', 'data:text/html,hi'),
    sample.replace('https://example.com/?x=1&y=2#inbox', '/relative'),
    sample.replace('https://example.com/?x=1&y=2#inbox', 'https:example.com')]) {
    assert.throws(() => M.parse(source), undefined, source);
  }
});

test('rejects aliases, custom tags, multiple documents, excessive depth and size', () => {
  assert.throws(() => M.parse('categories: &a [*a]'), /aliases/);
  assert.throws(() => M.parse('categories: !evil []'), /tags/);
  assert.throws(() => M.parse('categories: []\n---\ncategories: []'));
  assert.throws(() => M.parse('categories: ' + '['.repeat(50) + ']'.repeat(50)), /deep/);
  assert.throws(() => M.parse('#' + 'x'.repeat(M.MAX_BYTES)), /1 MiB/);
  assert.throws(() => M.parse('categories: [' + Array.from({length: 201}, (_, i) => `{name: c${i}, bookmarks: []}`).join(',') + ']'), /200/);
});

test('local and special URLs survive; unknown metadata/icons warn safely', () => {
  for (const url of ['http://192.168.1.2:8080/#x', 'http://homeassistant.local:8123/', 'file:///D:/notes.txt', 'chrome://settings/']) {
    assert.equal(M.parse(sample.replace('https://example.com/?x=1&y=2#inbox', url)).categories[0].children[0].url, url);
  }
  const p = M.parse(sample.replace('mdi-gmail', 'unknown-icon') + '        metadata: 1\n');
  assert.equal(p.warnings.length, 2);
  assert.equal(M.glyph('unknown-icon'), M.glyph('link-variant'));
  assert.equal(M.glyph('__proto__'), M.glyph('link-variant'));
});

test('IDs are stable, namespaced and collision safe', () => {
  const first = M.parse(sample);
  const changed = M.parse(sample.replace('https://example.com/', 'https://other.test/'));
  assert.equal(first.categories[0].id, changed.categories[0].id);
  assert.equal(first.categories[0].children[0].id, changed.categories[0].children[0].id);
  assert.notEqual(M.categoryId('a.bookmark.b'), M.bookmarkId('a', 'b'));
  assert.notEqual(M.categoryId('a.b'), M.categoryId('a%2Eb'));
  assert.equal(M.parse('categories: [{name: __proto__, bookmarks: []}]').nodes.size, 1);
});

test('imports commit only validated YAML and handle storage failures/conflicts', () => {
  const storage = memory(), store = new M.BookmarksStore(storage);
  store.save(sample, null);
  const raw = store.raw();
  assert.throws(() => store.save('invalid'), /Root/);
  assert.equal(store.raw(), raw);
  assert.throws(() => store.save(M.EMPTY_YAML, null), /another tab/);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => store.save(M.EMPTY_YAML, raw), /Quota/);
  assert.equal(store.raw(), raw);
  assert.throws(() => M.decodeRecord('{'), /JSON/);
  assert.throws(() => M.decodeRecord('{"version":2,"source":"categories: []"}'), /format/);
});

test('quick add/edit/delete round-trip through YAML and preserve comments', () => {
  const store = new M.BookmarksStore(memory());
  store.save(sample);
  let p = store.upsert({ category: 'Work', name: 'Docs', url: 'https://docs.example/', icon: 'book' });
  assert.equal(p.count, 2);
  assert.match(p.source, /# My list/);
  const id = M.bookmarkId('Work', 'Docs');
  p = store.upsert({ category: 'Work', name: 'Docs 2', url: 'https://new.example/', icon: '' }, id);
  assert.equal(p.count, 2);
  assert.equal(p.nodes.get(M.bookmarkId('Work', 'Docs 2')).mdiIcon, '');
  p = store.upsert({ category: 'Reading', name: 'Docs', url: 'https://docs.example/', icon: '' }, M.bookmarkId('Work', 'Docs 2'));
  assert.equal(p.categories.length, 2);
  assert.equal(p.categories[0].children.length, 1);
  assert.equal(p.categories[1].pinned, true);
  assert.throws(() => store.upsert({ category: 'Work', name: 'Mail', url: 'https://x/' }), /already exists/);
  p = store.remove(M.bookmarkId('Reading', 'Docs'));
  assert.equal(p.count, 1);
  assert.equal(p.categories[1].children.length, 0);
  assert.match(p.source, /# My list/);
  assert.equal(M.parse(p.source).count, 1);
});

test('layout reconciliation drops stale/hidden IDs, deduplicates, and handles empty', () => {
  const saved = [['1', 'recent', 'a', 'a'], ['b'], ['deleted']];
  assert.deepEqual(M.reconcileColumns(saved, ['a', 'b', 'c'], id => id !== 'b'), [['a', 'c']]);
  assert.deepEqual(M.reconcileColumns([], [], () => true), []);
  assert.deepEqual(M.reconcileColumns(null, ['a'], () => true), [['a']]);
});

test('settings restore validates bookmarks before touching other settings', () => {
  const storage = memory();
  storage.setItem('options.theme', 'Flame');
  assert.throws(() => M.restoreSettings(storage, JSON.stringify({ 'options.theme': 'Classic', [M.DATA_KEY]: '{bad' })));
  assert.equal(storage.getItem('options.theme'), 'Flame');
  M.restoreSettings(storage, JSON.stringify({ 'options.theme': 'Classic', [M.DATA_KEY]: JSON.stringify({version: 1, source: sample}), 'column.0.0': '1' }));
  assert.equal(storage.getItem('options.theme'), 'Classic');
  assert.equal(new M.BookmarksStore(storage).load().count, 1);
  assert.equal(storage.getItem('column.0.0'), null);
});

test('bookmark count limit applies to YAML and quick edits', () => {
  const source = JSON.stringify({categories: [{name: 'Many', bookmarks: Array.from({length: 10001}, (_, i) => ({name: 'b' + i, url: 'https://x/'}))}]});
  assert.throws(() => M.parse(source), /10000/);
});

test('settings restore rolls back all writes after a storage failure', () => {
  const storage = memory();
  storage.setItem('options.theme', 'Flame');
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'options.font' && value === 'Custom') throw new Error('Quota');
    write(key, value);
  };
  assert.throws(() => M.restoreSettings(storage, JSON.stringify({'options.theme': 'Classic', 'options.font': 'Custom'})), /Quota/);
  assert.equal(storage.getItem('options.theme'), 'Flame');
  assert.equal(storage.getItem('options.font'), null);
});
