'use strict';
const YAML = require('yaml');
const iconGlyphs = require('./assets/mdi-names.json');
const DATA_KEY = 'customBookmarks.v1';
const LAYOUT_KEY = 'customLayout.v1';
const OPEN_PREFIX = 'customOpen.';
const EMPTY_YAML = 'categories: []\n';
const MAX_BYTES = 1024 * 1024;
const MAX_CATEGORIES = 200;
const MAX_BOOKMARKS = 10000;
const PROTOCOLS = new Set(['http:', 'https:', 'file:', 'chrome:']);
const iconNames = Object.keys(iconGlyphs);

function fail(message) { throw new Error(message); }
function mapping(value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at} must be a mapping.`);
}
function name(value, at) {
  if (typeof value !== 'string' || !value.trim()) fail(`${at} must be a nonblank string.`);
  return value.trim();
}
function url(value, at) {
  const text = name(value, at);
  // URL() repairs some malformed inputs; do not accept those repairs or controls.
  if (/[\u0000-\u0020\u007f]/.test(text) || text.includes('\\')) fail(`${at} contains whitespace or backslashes.`);
  let parsed;
  try { parsed = new URL(text); } catch { fail(`${at} must be an absolute URL.`); }
  if (!PROTOCOLS.has(parsed.protocol)) fail(`${at}: only http, https, file, and chrome URLs are allowed.`);
  if (!/^\w+:\/\//.test(text)) fail(`${at} must include ://.`);
  if (parsed.protocol !== 'file:' && !parsed.hostname) fail(`${at} must include a host.`);
  return text;
}
function normalizeIcon(value) {
  return typeof value === 'string' ? value.trim().replace(/^mdi-/, '') : '';
}
function glyph(value) {
  const key = normalizeIcon(value);
  return Object.hasOwn(iconGlyphs, key) ? iconGlyphs[key] : iconGlyphs['link-variant'];
}
function encodeName(value) { return encodeURIComponent(value).replace(/\./g, '%2E'); }
function categoryId(value) { return 'custom.category.' + encodeName(value); }
function bookmarkId(category, value) { return categoryId(category) + '.bookmark.' + encodeName(value); }
function unknownFields(value, allowed, at, warnings) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) warnings.push(`${at}: ignored field “${key}”.`);
}

function parse(source) {
  if (typeof source !== 'string') fail('YAML source must be text.');
  if (new TextEncoder().encode(source).length > MAX_BYTES) fail('YAML must be at most 1 MiB.');
  const doc = YAML.parseDocument(source, {
    schema: 'core', version: '1.2', merge: false, resolveKnownTags: false,
    uniqueKeys: true, stringKeys: true, customTags: [], prettyErrors: true
  });
  if (doc.errors.length) fail(doc.errors[0].message);
  // Reject aliases outright: safe, predictable quick editing and no expansion bombs.
  YAML.visit(doc, (key, node, path) => {
    if (path.length > 40) fail('YAML nesting is too deep.');
    if (YAML.isAlias(node)) fail('YAML aliases are not supported. Use explicit bookmark entries.');
    if (node && node.tag && !['tag:yaml.org,2002:str', 'tag:yaml.org,2002:bool',
      'tag:yaml.org,2002:null', 'tag:yaml.org,2002:int', 'tag:yaml.org,2002:float',
      'tag:yaml.org,2002:map', 'tag:yaml.org,2002:seq'].includes(node.tag)) fail('Custom YAML tags are not supported.');
  });
  if (doc.warnings.length) fail(doc.warnings[0].message);
  const data = doc.toJS({ maxAliasCount: 0 });
  mapping(data, 'Root');
  if (!Array.isArray(data.categories)) fail('categories must be an array.');
  if (data.categories.length > MAX_CATEGORIES) fail(`Use at most ${MAX_CATEGORIES} categories.`);
  const warnings = [];
  unknownFields(data, ['categories'], 'Root', warnings);
  const nodes = new Map();
  const categories = [];
  const categoryNames = new Set();
  let count = 0;
  data.categories.forEach((raw, categoryIndex) => {
    const at = `categories[${categoryIndex}]`;
    mapping(raw, at);
    const title = name(raw.name, `${at}.name`);
    if (categoryNames.has(title)) fail(`Duplicate category name: ${title}.`);
    categoryNames.add(title);
    if (raw.pinned !== undefined && typeof raw.pinned !== 'boolean') fail(`${at}.pinned must be a boolean.`);
    if (!Array.isArray(raw.bookmarks)) fail(`${at}.bookmarks must be an array.`);
    unknownFields(raw, ['name', 'pinned', 'bookmarks'], at, warnings);
    const category = { id: categoryId(title), title, pinned: raw.pinned || false,
      custom: true, categoryIndex, children: [] };
    const bookmarkNames = new Set();
    raw.bookmarks.forEach((rawBookmark, bookmarkIndex) => {
      if (++count > MAX_BOOKMARKS) fail(`Use at most ${MAX_BOOKMARKS} bookmarks.`);
      const location = `${at}.bookmarks[${bookmarkIndex}]`;
      mapping(rawBookmark, location);
      const title = name(rawBookmark.name, `${location}.name`);
      if (bookmarkNames.has(title)) fail(`Duplicate bookmark name in ${category.title}: ${title}.`);
      bookmarkNames.add(title);
      if (rawBookmark.icon !== undefined && typeof rawBookmark.icon !== 'string') fail(`${location}.icon must be a string.`);
      const mdiIcon = normalizeIcon(rawBookmark.icon);
      if (mdiIcon && !Object.hasOwn(iconGlyphs, mdiIcon)) warnings.push(`${location}: unknown MDI icon “${mdiIcon}”; using link-variant.`);
      unknownFields(rawBookmark, ['name', 'url', 'icon'], location, warnings);
      const bookmark = { id: bookmarkId(category.title, title), title,
        url: url(rawBookmark.url, `${location}.url`), mdiIcon, custom: true,
        categoryId: category.id, categoryIndex, bookmarkIndex };
      category.children.push(bookmark);
      nodes.set(bookmark.id, bookmark);
    });
    categories.push(category);
    nodes.set(category.id, category);
  });
  return { source, doc, categories, nodes, count, warnings };
}

function decodeRecord(raw) {
  if (raw === null) return parse(EMPTY_YAML);
  let record;
  try { record = JSON.parse(raw); } catch { fail('Saved bookmark record is not valid JSON. Export it for recovery or import valid YAML.'); }
  if (!record || record.version !== 1 || typeof record.source !== 'string') fail('Unsupported saved bookmark format.');
  return parse(record.source);
}

class BookmarksStore {
  constructor(storage) { this.storage = storage; }
  raw() { return this.storage.getItem(DATA_KEY); }
  load() { return decodeRecord(this.raw()); }
  save(source, expectedRaw) {
    const next = parse(source);
    if (expectedRaw !== undefined && this.raw() !== expectedRaw) fail('Bookmarks changed in another tab. Reload the saved list before applying.');
    // One write; if validation or setItem throws, the previous record remains intact.
    this.storage.setItem(DATA_KEY, JSON.stringify({ version: 1, source }));
    return next;
  }
  mutate(edit, expectedRaw) {
    const raw = this.raw();
    if (expectedRaw !== undefined && raw !== expectedRaw) fail('Bookmarks changed in another tab. Reopen the bookmark form.');
    const current = decodeRecord(raw);
    edit(current.doc, current);
    return this.save(current.doc.toString({ lineWidth: 0 }), raw);
  }
  upsert(fields, existingId, expectedRaw) {
    return this.mutate((doc, current) => {
      const categoryName = name(fields.category, 'Category');
      const bookmarkName = name(fields.name, 'Name');
      const bookmarkUrl = url(fields.url, 'URL');
      const icon = normalizeIcon(fields.icon);
      const old = existingId && current.nodes.get(existingId);
      if (existingId && (!old || old.children)) fail('This bookmark no longer exists.');
      let target = current.categories.find(category => category.title === categoryName);
      if (target && target.children.some(node => node.title === bookmarkName && node.id !== existingId)) fail(`A bookmark named ${bookmarkName} already exists in ${categoryName}.`);
      if (!target) {
        doc.addIn(['categories'], doc.createNode({ name: categoryName, pinned: true, bookmarks: [] }));
        target = { categoryIndex: current.categories.length };
      }
      const targetPath = ['categories', target.categoryIndex, 'bookmarks'];
      if (old && old.categoryIndex === target.categoryIndex) {
        const path = [...targetPath, old.bookmarkIndex];
        // Editing the AST keeps surrounding comments and unrelated metadata.
        doc.setIn([...path, 'name'], bookmarkName);
        doc.setIn([...path, 'url'], bookmarkUrl);
        if (icon) doc.setIn([...path, 'icon'], icon); else doc.deleteIn([...path, 'icon']);
      } else {
        const entry = old ? doc.getIn(['categories', old.categoryIndex, 'bookmarks', old.bookmarkIndex]).clone() : doc.createNode({});
        entry.set('name', bookmarkName);
        entry.set('url', bookmarkUrl);
        if (icon) entry.set('icon', icon); else entry.delete('icon');
        if (old) doc.deleteIn(['categories', old.categoryIndex, 'bookmarks', old.bookmarkIndex]);
        doc.addIn(targetPath, entry);
      }
    }, expectedRaw);
  }
  remove(id, expectedRaw) {
    return this.mutate((doc, current) => {
      const node = current.nodes.get(id);
      if (!node || node.children) fail('This bookmark no longer exists.');
      doc.deleteIn(['categories', node.categoryIndex, 'bookmarks', node.bookmarkIndex]);
    }, expectedRaw);
  }
}

function reconcileColumns(saved, roots, visible) {
  const allowed = new Set(roots);
  const seen = new Set();
  const result = [];
  if (Array.isArray(saved)) for (const row of saved) {
    if (!Array.isArray(row)) continue;
    const clean = row.filter(id => typeof id === 'string' && allowed.has(id) && visible(id) && !seen.has(id) && seen.add(id));
    if (clean.length) result.push(clean);
  }
  const missing = roots.filter(id => visible(id) && !seen.has(id));
  if (missing.length) {
    if (!result.length) result.push([]);
    result[0].push(...missing);
  }
  return result;
}

// Validate backups before modifying localStorage; rollback if any write fails.
function restoreSettings(storage, text) {
  const imported = JSON.parse(text);
  mapping(imported, 'Settings');
  const entries = Object.entries(imported).filter(([key]) => key === DATA_KEY || key === LAYOUT_KEY ||
    key.startsWith(OPEN_PREFIX) || key.startsWith('options.'));
  for (const [key, value] of entries) {
    if (typeof value !== 'string') fail(`Settings value ${key} must be a string.`);
    if (key === DATA_KEY) decodeRecord(value);
    if (key === LAYOUT_KEY) {
      const layout = JSON.parse(value);
      if (!Array.isArray(layout) || layout.some(row => !Array.isArray(row) || row.some(id => typeof id !== 'string'))) fail('Invalid custom layout.');
    }
  }
  const previous = entries.map(([key]) => [key, storage.getItem(key)]);
  try { for (const [key, value] of entries) storage.setItem(key, value); }
  catch (error) {
    for (const [key, value] of previous) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* surface original failure */ }
    }
    throw error;
  }
}

module.exports = { parse, decodeRecord, BookmarksStore, reconcileColumns, restoreSettings,
  glyph, normalizeIcon, iconNames, categoryId, bookmarkId, DATA_KEY, LAYOUT_KEY, OPEN_PREFIX, EMPTY_YAML, MAX_BYTES };
