'use strict';
// Generated runtime assets only. Source files are never rewritten by the build.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function build() {
  fs.mkdirSync('assets', { recursive: true });
  const css = fs.readFileSync('node_modules/@mdi/font/css/materialdesignicons.css', 'utf8');
  const names = {};
  for (const match of css.matchAll(/\.mdi-([a-z0-9-]+)::before\s*\{\s*content: "\\([A-F0-9]+)";/g)) {
    names[match[1]] = String.fromCodePoint(parseInt(match[2], 16));
  }
  if (Object.keys(names).length < 7000) throw new Error('MDI extraction failed');
  fs.writeFileSync('assets/mdi-names.json', JSON.stringify(names));
  fs.writeFileSync('assets/mdi.css', '/* Generated from @mdi/font 7.4.47; see MDI-LICENSE.txt */\n' +
    '@font-face{font-family:"Material Design Icons";src:url("mdi.woff2") format("woff2");font-weight:normal;font-style:normal;font-display:block}\n' +
    '.mdi-icon{font-family:"Material Design Icons"!important;font-weight:normal;font-style:normal;line-height:1;text-rendering:auto;-webkit-font-smoothing:antialiased}\n');
  for (const [from, to] of [
    ['@mdi/font/fonts/materialdesignicons-webfont.woff2', 'mdi.woff2'],
    ['@mdi/font/LICENSE', 'MDI-LICENSE.txt'],
    ['yaml/LICENSE', 'YAML-LICENSE.txt']
  ]) fs.copyFileSync(path.join('node_modules', from), path.join('assets', to));
  await esbuild.build({
    entryPoints: ['custom-bookmarks.js'],
    outfile: 'assets/custom-bookmarks.bundle.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'CustomBookmarks',
    target: 'chrome104',
    minify: true,
    legalComments: 'inline'
  });
  console.log(`Bundled YAML parser and ${Object.keys(names).length} local MDI icons.`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
