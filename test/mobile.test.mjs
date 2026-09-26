// Phone-sized, touch-screen use: folded toolbar, taps keep the selection, full-screen dialogs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { playwright, chromiumOptions } from './helpers.mjs';
import { startServer } from './server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SCREENSHOTS;
let srv, browser;
before(async () => { srv = await startServer(repo); browser = await playwright.chromium.launch(chromiumOptions()); });
after(async () => { await browser?.close(); srv?.server.close(); });

test('phone: folded toolbar, tap formatting, full-screen dialog', async () => {
  const { defaultBrowserType, ...iphone } = playwright.devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iphone, locale: 'sv-SE' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.port}/demo/index.html`);
  await page.locator('.dvw-area').waitFor();

  assert.ok(await page.locator('.dvw-more').isVisible(), 'the ⋯ button is shown on a phone');
  assert.ok(!(await page.locator('.dvw-center').isVisible()), 'secondary tools are folded away');
  assert.ok(await page.locator('.dvw-image').isVisible(), 'image stays visible');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'mobile.png') });
  await page.locator('.dvw-more').tap();
  assert.ok(await page.locator('.dvw-center').isVisible(), 'secondary tools unfold');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'mobile-more.png') });
  await page.locator('.dvw-more').tap();

  // select a word, then tap B: the selection must survive the tap
  await page.evaluate(() => {
    const ed = DiversiaEditor.get(document.querySelector('textarea[name=text]'));
    ed.setMarkup('Hejsan allihop');
    const t = document.querySelector('.dvw-area').firstChild;
    document.querySelector('.dvw-area').focus();
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 6);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.activeElement.blur();      // what a touch on the toolbar can do in some browsers
  });
  await page.locator('.dvw-b').tap();
  assert.equal(await page.locator('textarea[name=text]').inputValue(), '<b>Hejsan</b> allihop');

  // dialogs use the whole screen
  await page.locator('.dvw-image').tap();
  const box = await page.locator('.dvw-modal').boundingBox();
  const vp = page.viewportSize();
  assert.ok(Math.abs(box.width - vp.width) < 2 && Math.abs(box.height - vp.height) < 2, JSON.stringify({ box, vp }));
  await ctx.close();
});
