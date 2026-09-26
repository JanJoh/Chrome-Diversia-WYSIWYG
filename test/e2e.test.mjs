// End-to-end tests: the editor on the demo page, and the packed extension on a
// mock Diversia page (served locally, with diversia.social resolved to 127.0.0.1).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { playwright, chromiumOptions } from './helpers.mjs';
import { build } from '../scripts/build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SCREENSHOTS;  // directory for README screenshots (optional)

const MOCK = `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Dagbok</title>
<body style="background:#111;color:#ddd;font-family:Verdana">
<form id="f" method="post" action="/save">
  <input name="title" value="Rubrik">
  <textarea name="text" rows="10" cols="80">Hej <b>fet</b> text</textarea>
  <textarea name="small" rows="1"></textarea>
  <button id="save" type="submit">Spara</button>
</form></body></html>`;

let server, port, browser;
before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const v = new URLSearchParams(body).get('text');
        res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(v);
      });
      return;
    }
    if (req.url.startsWith('/mock')) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(MOCK); return; }
    try {
      const file = path.join(repo, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(repo)) throw new Error('outside');
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
      res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch (e) { res.statusCode = 404; res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(async () => { await browser?.close(); server?.close(); });

test('demo page: toolbar formatting ends up as Diversia markup in the textarea', async () => {
  browser = await playwright.chromium.launch(chromiumOptions());
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/demo/index.html`);
  const area = page.locator('.dvw-area');
  await area.waitFor();
  // existing content is rendered, not shown as tags
  assert.equal(await area.locator('b', { hasText: 'Hon:' }).count(), 1);
  assert.equal(await area.locator('.dvw-embed[data-dv="spotify"]').count(), 1);

  // type at the end, select it, make it bold and red
  await area.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ny rad');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 'Ny rad'.length; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.click('.dvw-b');
  await page.click('.dvw-swatch >> nth=0');
  const value = await page.locator('textarea[name=text]').inputValue();
  assert.match(value, /<font color=#C62828><b>Ny rad<\/b><\/font>$|<b><font color=#C62828>Ny rad<\/font><\/b>$/);
  assert.match(value, /<spotify spotify:playlist:37i9dQZF1DXcBWIGoYBM5M>/);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'demo.png'), fullPage: false });

  // source mode shows the raw markup and edits flow back
  await page.click('.dvw-source');
  const ta = page.locator('textarea[name=text]');
  assert.ok(await ta.isVisible());
  await ta.fill('<i>bara kursiv</i>');
  await page.click('.dvw-source');
  assert.equal(await area.locator('i', { hasText: 'bara kursiv' }).count(), 1);

  // pasting rich HTML is cleaned to the whitelist
  await area.click();
  await page.keyboard.press('Control+End');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<h2>Rubrik</h2><p style="color:#1565c0">blå <script>x</script>text</p>');
    dt.setData('text/plain', 'Rubrik\nblå text');
    document.querySelector('.dvw-area').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const after = await ta.inputValue();
  assert.match(after, /<font size=5><b>Rubrik<\/b><\/font>/);
  assert.match(after, /<font color=#1565C0>blå text<\/font>/);
  assert.doesNotMatch(after, /script/);

  // form submission carries the markup
  await page.click('button[type=submit]');
  assert.equal(await page.locator('#sent').textContent(), after);
  await browser.close(); browser = null;
});

test('extension: switch appears on Diversia pages and the form posts markup', async () => {
  build(['chrome']);
  const extDir = path.join(repo, 'dist', 'chrome');
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'dvw-'));
  const ctx = await playwright.chromium.launchPersistentContext(userDataDir, chromiumOptions({
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      `--host-resolver-rules=MAP www.diversia.social 127.0.0.1:${port}`,
    ],
    viewport: { width: 1000, height: 800 },
  }));
  try {
    const page = await ctx.newPage();
    await page.goto('http://www.diversia.social/mock.html');
    const sw = page.locator('.dvw-switch');
    await sw.first().waitFor({ timeout: 15000 });
    assert.equal(await sw.count(), 1, 'only the big textarea gets a switch');
    await sw.click();
    const area = page.locator('.dvw-area');
    await area.waitFor();
    assert.equal(await area.locator('b', { hasText: 'fet' }).count(), 1);
    await area.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' och ');
    await page.keyboard.press('Control+i');
    await page.keyboard.type('kursiv');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'extension.png') });
    await Promise.all([page.waitForNavigation(), page.click('#save')]);
    assert.equal((await page.textContent('body')).trim(), 'Hej <b>fet</b> text och <i>kursiv</i>');

    // the preference is remembered: next visit opens in visual mode
    await page.goto('http://www.diversia.social/mock.html');
    await page.locator('.dvw-area').waitFor({ timeout: 15000 });
  } finally {
    await ctx.close();
  }
});

// The version notice, driven from a seeded cache so the test never reaches
// GitHub: what is exercised is the content script -> background -> storage
// path and the rendering, not the network.
test('extension: a newer release is announced next to the switch, and can be switched off', async () => {
  build(['chrome']);
  const extDir = path.join(repo, 'dist', 'chrome');
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'dvw-'));
  const ctx = await playwright.chromium.launchPersistentContext(userDataDir, chromiumOptions({
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      `--host-resolver-rules=MAP www.diversia.social 127.0.0.1:${port}`,
    ],
    viewport: { width: 1000, height: 800 },
  }));
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    // A fresh timestamp keeps the once-a-day rule satisfied, so no fetch happens.
    const seed = (v) => sw.evaluate(async (latest) => {
      await chrome.storage.local.set({ 'dvw-versioncheck': { t: Date.now(), latest } });
    }, v);

    await seed('v9.9.9');
    const page = await ctx.newPage();
    await page.goto('http://www.diversia.social/mock.html');
    const notice = page.locator('.dvw-update');
    await notice.waitFor({ timeout: 15000 });
    assert.match(await notice.textContent(), /9\.9\.9/);
    assert.match(await notice.getAttribute('href'), /JanJoh\/Chrome-Diversia-WYSIWYG\/releases$/);

    // An older or equal release says nothing at all.
    await seed('v0.0.1');
    await page.reload();
    await page.locator('.dvw-switch').first().waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.dvw-update').count(), 0, 'no notice for an older release');

    // Switching the check off silences it even when a newer release is known.
    await seed('v9.9.9');
    await sw.evaluate(async () => { await chrome.storage.local.set({ 'dvw-updatecheck': false }); });
    await page.reload();
    await page.locator('.dvw-switch').first().waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.dvw-update').count(), 0, 'switched off');
  } finally {
    await ctx.close();
  }
});
