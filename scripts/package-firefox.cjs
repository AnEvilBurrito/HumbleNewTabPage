'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const browser = process.argv[2] || 'firefox';
if (!['firefox', 'chrome'].includes(browser)) throw new Error(`Unsupported browser: ${browser}`);
const output = path.join(root, 'build', browser);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (browser === 'firefox') {
  delete manifest.minimum_chrome_version;
  manifest.permissions = manifest.permissions.filter(permission => !['favicon', 'fontSettings'].includes(permission));
  manifest.browser_specific_settings = {
    gecko: {
      id: 'flame-humble-new-tab@humble-new-tab',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] }
    }
  };
}
fs.mkdirSync(output, { recursive: true });
for (const name of ['newtab.html', 'newtab.css', 'newtab.js', 'custom-bookmarks-ui.js', 'LICENSE_MIT.txt', 'privacy.md', 'icons', 'assets']) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
async function packageArchives() {
  const { ZipArchive } = await import('archiver');
  const destination = path.join(root, 'build', `${browser}-release`);
  fs.mkdirSync(destination, { recursive: true });
  async function zip(name, entries) {
    const stream = fs.createWriteStream(path.join(destination, name));
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const complete = new Promise((resolve, reject) => {
      stream.on('close', resolve);
      stream.on('error', reject);
      archive.on('error', reject);
    });
    archive.pipe(stream);
    for (const entry of entries) {
      const source = path.join(entry.root, entry.name);
      if (fs.statSync(source).isDirectory()) archive.directory(source, entry.name);
      else archive.file(source, { name: entry.name });
    }
    await archive.finalize();
    await complete;
  }
  const runtime = ['manifest.json', 'newtab.html', 'newtab.css', 'newtab.js', 'custom-bookmarks-ui.js', 'LICENSE_MIT.txt', 'privacy.md', 'icons', 'assets'];
  const sources = ['manifest.json', 'newtab.html', 'newtab.css', 'newtab.js', 'custom-bookmarks.js', 'custom-bookmarks-ui.js', 'package.json', 'package-lock.json', 'scripts', 'tests', 'docs', 'icons', 'LICENSE_MIT.txt', 'privacy.md', 'README.md', 'assets/APACHE-2.0.txt'];
  await zip(`${browser}-${manifest.version}.zip`, runtime.map(name => ({ root: output, name })));
  await zip(`${browser}-${manifest.version}-source.zip`, sources.map(name => ({ root, name })));
  console.log(`${browser} runtime and source archives written to ${destination}`);
}
packageArchives().catch(error => { console.error(error); process.exitCode = 1; });