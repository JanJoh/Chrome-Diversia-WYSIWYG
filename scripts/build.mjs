// Builds one package per browser from the shared source:
//   dist/chrome/   + dist/diversia-wysiwyg-chrome-<v>.zip   (Chrome, Edge, Brave, Opera, Vivaldi)
//   dist/firefox/  + dist/diversia-wysiwyg-firefox-<v>.zip  (Firefox desktop and Android)
//   dist/safari/   + dist/diversia-wysiwyg-safari-<v>.zip   (Safari on macOS, iOS, iPadOS)
// The repository root itself is a valid Chrome extension ("Load unpacked").
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const base = JSON.parse(readFileSync('manifest.json', 'utf8'));
const FILES = ['src', 'icons', 'LICENSE'];
const clone = (o) => JSON.parse(JSON.stringify(o));

export const GECKO_ID = 'diversia-wysiwyg@extensions';

export function manifestFor(target) {
  const m = clone(base);
  if (target === 'firefox') {
    // Firefox MV3 runs background scripts as event pages, not service workers.
    // Event pages have no importScripts, so version.js is listed here instead.
    m.background = { scripts: ['src/version.js', 'src/background.js'] };
    m.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '128.0',
        // the extension collects and sends nothing
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '128.0' },
    };
  }
  if (target === 'safari') {
    // Safari supports the Chrome-style MV3 manifest; keep it identical apart
    // from a slightly more descriptive title for the iOS extensions list.
    m.action.default_title = 'Diversia WYSIWYG';
  }
  return m;
}

export function build(targets = ['chrome', 'firefox', 'safari']) {
  rmSync('dist', { recursive: true, force: true });
  const out = [];
  for (const target of targets) {
    const dir = `dist/${target}`;
    mkdirSync(dir, { recursive: true });
    for (const f of FILES) cpSync(f, `${dir}/${f}`, { recursive: true });
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifestFor(target), null, 2) + '\n');
    const zip = `diversia-wysiwyg-${target}-${base.version}.zip`;
    execFileSync('zip', ['-r', '-q', `../${zip}`, '.'], { cwd: dir });
    out.push(`dist/${zip}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of build()) console.log('wrote', f);
}
