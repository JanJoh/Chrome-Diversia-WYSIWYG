// Image picker (gallery + URL checks + options) and member picker (friends list).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { playwright, chromiumOptions, KEYS } from './helpers.mjs';
import { startServer } from './server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SCREENSHOTS;
let srv, browser, page, base;

before(async () => {
  srv = await startServer(repo);
  base = `http://127.0.0.1:${srv.port}`;
  browser = await playwright.chromium.launch(chromiumOptions());
});
after(async () => { await browser?.close(); srv?.server.close(); });

beforeEach(async () => {
  page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  await page.goto(`${base}/demo/index.html`);
  await page.locator('.dvw-area').waitFor();
  await page.evaluate(() => { document.querySelector('textarea[name=text]').value = ''; });
  await page.evaluate(() => DiversiaEditor.get(document.querySelector('textarea[name=text]')).setMarkup('Start'));
  await page.locator('.dvw-area').click();
  await page.keyboard.press(KEYS.toEnd);
});

const value = () => page.locator('textarea[name=text]').inputValue();

test('gallery: finds images across album pages, skips icons, inserts with size/align/border', async () => {
  await page.click('.dvw-image');
  const dlg = page.locator('.dvw-modal');
  await dlg.waitFor();
  // no saved gallery yet: suggestions from the site's own menu are offered
  await dlg.locator('.dvw-tab[data-tab=gallery]').click();
  await dlg.locator('.dvw-chip', { hasText: 'Mina bilder' }).click();
  await dlg.locator('.dvw-thumb').nth(6).waitFor();
  assert.equal(await dlg.locator('.dvw-thumb').count(), 7, 'photo1 de-duplicated, smiley skipped, album page read');
  await dlg.locator('.dvw-thumb[data-full$="photo2.jpg"]').click();
  await dlg.locator('.dvw-img-size').selectOption('50%');
  await dlg.locator('.dvw-img-align').selectOption('center');
  await dlg.locator('.dvw-img-border').selectOption('1');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'image-picker.png') });
  await dlg.locator('.dvw-insert').click();
  assert.match(await value(), new RegExp(`^Start<img src=${base}/demo/img/photo2\\.jpg border=1 width=50% align=center>$`));

  // editing: click the image, change size, update
  await page.locator('.dvw-area img').click();
  await dlg.waitFor();
  assert.equal(await dlg.locator('.dvw-img-size').inputValue(), '50%');
  await dlg.locator('.dvw-img-size').selectOption('px');
  await dlg.locator('.dvw-px').fill('320');
  await dlg.locator('.dvw-insert').click();
  assert.match(await value(), /<img src=\S+photo2\.jpg border=1 width=320 align=center>$/);

  // remove
  await page.locator('.dvw-area img').click();
  await dlg.locator('.dvw-danger').click();
  assert.equal(await value(), 'Start');

  // the gallery address is remembered and loads straight away next time
  await page.click('.dvw-image');
  await dlg.locator('.dvw-thumb').nth(6).waitFor();
  await dlg.locator('.dvw-x').click();
});

test('image URL: sanity checks and helpful messages', async () => {
  await page.click('.dvw-image');
  const dlg = page.locator('.dvw-modal');
  await dlg.locator('.dvw-tab[data-tab=url]').click();
  const check = async (url) => {
    await dlg.locator('.dvw-img-url').fill(url);
    await dlg.locator('.dvw-check').click();
    await page.waitForFunction(() => !/Kontrollerar/.test(document.querySelector('.dvw-modal .dvw-pane:not([hidden]) .dvw-status').textContent));
    return {
      status: await dlg.locator('.dvw-pane:not([hidden]) .dvw-status').textContent(),
      url: await dlg.locator('.dvw-img-url').inputValue(),
      button: await dlg.locator('.dvw-insert').textContent(),
      disabled: await dlg.locator('.dvw-insert').isDisabled(),
    };
  };

  let r = await check('data:image/png;base64,AAAA');
  assert.match(r.status, /din egen dator/); assert.ok(r.disabled);

  r = await check('not a url at all');
  assert.ok(r.disabled);

  r = await check('http://example.invalid/pic.jpg');
  assert.match(r.status, /kräver https/);
  assert.equal(r.url, 'https://example.invalid/pic.jpg');
  assert.match(r.status, /gick inte att ladda/);
  assert.equal(r.button, 'Infoga ändå');

  r = await check('https://example.invalid/some/page');
  assert.match(r.status, /webbsida, inte till en bild/);

  r = await check('imgur.com/AbCdEf1');
  assert.equal(r.url, 'https://i.imgur.com/AbCdEf1.jpg');
  assert.match(r.status, /imgur-sida/);

  r = await check(`${base}/demo/img/photo7.jpg`);
  assert.match(r.status, /Det är en bild \(1800 × 1200 px\)/);
  assert.match(r.status, /1800 px bred/);
  assert.equal(r.button, 'Infoga');
  await dlg.locator('.dvw-img-size').selectOption('75%');
  await dlg.locator('.dvw-insert').click();
  assert.match(await value(), /<img src=\S+photo7\.jpg width=75%>$/);
});

test('member picker: friends list, search, keyboard, number fallback, wrapping a selection', async () => {
  await page.click('.dvw-member-btn');
  const dlg = page.locator('.dvw-modal');
  await dlg.locator('.dvw-tab[data-tab=friends]').click();
  await dlg.locator('.dvw-chip', { hasText: 'Mina vänner' }).click();
  await dlg.locator('.dvw-member').first().waitFor();
  const names = await dlg.locator('.dvw-member > span:first-child').allTextContents();
  assert.deepEqual(names, ['Ask', 'Blåklint', 'Ängla', 'Östersjön'], 'site menu links excluded, Swedish sort order');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'member-picker.png') });
  await dlg.locator('.dvw-member-search').fill('öster');
  await dlg.locator('.dvw-member-search').press('Enter');
  assert.equal(await value(), 'Start<m 31337>Östersjön</m>');

  // number tab
  await page.click('.dvw-member-btn');
  await dlg.locator('.dvw-tab[data-tab=number]').click();
  await dlg.locator('.dvw-member-number').fill('12345');
  await dlg.locator('.dvw-member-name').fill('Någon');
  await dlg.locator('.dvw-add-number').click();
  assert.equal(await value(), 'Start<m 31337>Östersjön</m><m 12345>Någon</m>');

  // with a selection, the selected text becomes the link text
  await page.evaluate(() => DiversiaEditor.get(document.querySelector('textarea[name=text]')).setMarkup('Hej Ask!'));
  await page.evaluate(() => {
    const t = [...document.querySelector('.dvw-area').childNodes].find((n) => n.nodeType === 3);
    const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 7);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.click('.dvw-member-btn');
  await dlg.locator('.dvw-member', { hasText: 'Ask' }).click();
  assert.equal(await value(), 'Hej <m 777>Ask</m>!');
});

test('pickers refuse other sites (same-origin only)', async () => {
  const err = await page.evaluate(() => DiversiaPickers.scanGallery('https://example.com/gallery').then(() => '', (e) => e.message));
  assert.match(err, /samma sajt/);
});

// The real diversia.social menu, which is not as tidy as it looks: the gallery
// keeps the member number in "id", the friends list keeps it in "offpage", and
// friends' own numbers are sitting in the same page.
const DIVERSIA_NAV = '<a href="/pic/?id=250">\u{1F5BC}️ Bilder</a>'
  + '<a href="/pic/">Bilder, 100.000-tals bilder</a>'
  + '<a href="/fav.php?offpage=250">\u2764️ V\u00e4nner</a>'
  + '<a href="/fav.php">V\u00e4nner</a>'
  + '<a href="/inloggade.php?friends=1">23 v\u00e4nner inloggade</a>'
  + '<a href="/profil.php?id=250">Jungleland</a><a href="/profil.php?id=250"></a>'
  + '<a href="/profil.php?id=72231">Porslinsdocka</a><a href="/profil.php?id=163856">Sensibel</a>';

const withNav = (kind) => page.evaluate((k) => {
  const nav = document.createElement('nav');
  nav.innerHTML = window.__nav;
  document.body.appendChild(nav);
  const r = DiversiaPickers.autoUrl(k);
  nav.remove();
  return r;
}, kind);

test('your own gallery is detected from the site menu, not the site-wide one', async () => {
  await page.evaluate((nav) => { window.__nav = nav; }, DIVERSIA_NAV);
  assert.match(await withNav('gallery'), /\/pic\/\?id=250$/);
});

test('the friends list is detected even though its member id is not called "id"', async () => {
  await page.evaluate((nav) => { window.__nav = nav; }, DIVERSIA_NAV);
  // fav.php?offpage=250 wins over fav.php and over "23 vänner inloggade",
  // whose friends=1 must not be mistaken for a member number
  assert.match(await withNav('friends'), /\/fav\.php\?offpage=250$/);
});

test('a site that exposes no personal address is left to the old paste-an-address flow', async () => {
  // the demo page links "Mina bilder" without any id, so nothing is assumed
  assert.equal(await page.evaluate(() => DiversiaPickers.autoUrl('gallery')), '');
});
