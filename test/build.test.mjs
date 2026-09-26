// The per-browser packages are complete and have the right manifest shape.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { build, GECKO_ID } from '../scripts/build.mjs';

let zips;
before(() => { zips = build(); });
const manifest = (t) => JSON.parse(readFileSync(`dist/${t}/manifest.json`, 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('one zip per browser, versions in sync', () => {
  assert.equal(zips.length, 3);
  for (const z of zips) assert.ok(existsSync(z), z);
  for (const t of ['chrome', 'firefox', 'safari']) assert.equal(manifest(t).version, pkg.version);
});

test('every referenced file exists in every package', () => {
  for (const t of ['chrome', 'firefox', 'safari']) {
    const m = manifest(t);
    const files = [
      ...m.content_scripts.flatMap((c) => [...c.js, ...c.css]),
      ...Object.values(m.icons),
      ...(m.background.scripts || [m.background.service_worker]),
    ];
    for (const f of files) assert.ok(existsSync(`dist/${t}/${f}`), `${t}: ${f}`);
    // files the background script injects on demand
    const bg = readFileSync(`dist/${t}/src/background.js`, 'utf8');
    for (const f of bg.match(/src\/[\w.]+\.(js|css)/g)) assert.ok(existsSync(`dist/${t}/${f}`), `${t}: ${f}`);
  }
});

test('Chrome and Safari use a service worker, Firefox an event page with a gecko id', () => {
  assert.equal(manifest('chrome').background.service_worker, 'src/background.js');
  assert.equal(manifest('safari').background.service_worker, 'src/background.js');
  const ff = manifest('firefox');
  assert.deepEqual(ff.background, { scripts: ['src/background.js'] });
  assert.equal(ff.browser_specific_settings.gecko.id, GECKO_ID);
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
});

test('source uses the browser/chrome shim, never chrome.* directly', () => {
  for (const f of readdirSync('src').filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(`src/${f}`, 'utf8');
    assert.doesNotMatch(src, /(^|[^.\w])chrome\.(storage|scripting|action|runtime|tabs)/m, f);
  }
});
