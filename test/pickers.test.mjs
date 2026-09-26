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

test('gallery: albums first, then the pictures inside one, with a way back', async () => {
  await page.click('.dvw-image');
  const dlg = page.locator('.dvw-modal');
  await dlg.waitFor();
  // no saved gallery yet: suggestions from the site's own menu are offered
  await dlg.locator('.dvw-tab[data-tab=gallery]').click();
  await dlg.locator('.dvw-chip', { hasText: 'Mina bilder' }).click();

  // the front page: loose pictures and the albums, read in one request
  await dlg.locator('.dvw-albumcard').waitFor();
  assert.equal(await dlg.locator('.dvw-thumb').count(), 4, 'four loose pictures, smiley skipped');
  assert.equal(await dlg.locator('.dvw-albumcard').count(), 1, 'one album');
  assert.equal((await dlg.locator('.dvw-albumname').textContent()).trim(), 'Semester');
  assert.ok(await dlg.locator('.dvw-back').isHidden(), 'nothing to go back to yet');
  // the address row has done its job and steps aside
  assert.ok(await dlg.locator('.dvw-source-row').isHidden(), 'address row hidden once loaded');
  assert.ok(await dlg.locator('.dvw-changeurl').isVisible(), 'but reachable again');

  // opening the album reads that page, and only that page
  await dlg.locator('.dvw-albumcard').click();
  await dlg.locator('.dvw-thumb[data-full$="photo5.jpg"]').waitFor();
  assert.equal(await dlg.locator('.dvw-thumb').count(), 4, 'the album\'s own pictures');
  assert.equal(await dlg.locator('.dvw-albumcard').count(), 0, 'albums replaced by their contents');
  assert.ok(await dlg.locator('.dvw-back').isVisible(), 'a way back');

  // and back again
  await dlg.locator('.dvw-back').click();
  await dlg.locator('.dvw-albumcard').waitFor();
  assert.equal(await dlg.locator('.dvw-thumb').count(), 4);

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

  // the gallery address is remembered and loads straight away next time,
  // back at the album list rather than wherever we left off
  await page.click('.dvw-image');
  await dlg.locator('.dvw-albumcard').waitFor();
  assert.equal(await dlg.locator('.dvw-thumb').count(), 4);
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
  const err = await page.evaluate(() => DiversiaPickers.scanIndex('https://example.com/gallery').then(() => '', (e) => e.message));
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

test('thumbnails drawn as background-image are read, not just <img>', async () => {
  // how diversia.social draws a gallery: the link itself carries the picture
  const found = await page.evaluate(() => {
    const html = '<a href="/pic/?bild=1" style="width:40%;background-image:url(https://cc.example.com/pres/a.jpg);background-size:cover"></a>'
      + '<a href="/pic/?bild=2" style="background-image:url(\'https://cc.example.com/pres/b.jpg\')"></a>'
      + '<div style="background-image:url(https://cc.example.com/pres/site-logo.png)"></div>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return DiversiaPickers.imagesFrom(doc, 'https://example.com/pic/?id=250').map((i) => i.thumb);
  });
  // the logo is skipped by the same rule that skips smileys and icons
  assert.deepEqual(found, ['https://cc.example.com/pres/a.jpg', 'https://cc.example.com/pres/b.jpg']);
});

test("the site's own shortcuts are never followed out of your gallery", async () => {
  const links = await page.evaluate(() => {
    const html = '<a href="/pic/?bild=9" style="background-image:url(https://cc.example.com/pres/cover.jpg)"></a>'
      + '<a href="/pic/?id=250&sida=2">Nästa sida</a>'
      + '<a href="/pic/">Bilder, 100.000-tals bilder</a>'
      + '<a href="/pic/?bild=82628">Persongalleriet</a>'
      + '<a href="/g.php?a=edit&id=250">✎ Redigera</a>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return DiversiaPickers.albumLinks(doc, 'https://example.com/pic/?id=250', '250');
  });
  // an album cover and your own next page; not the site-wide gallery, not
  // "Persongalleriet", and not the upload/edit controls outside /pic/
  assert.deepEqual(links, ['https://example.com/pic/?bild=9', 'https://example.com/pic/?id=250&sida=2']);
});

test('site furniture is kept out of the pictures', async () => {
  // what a diversia album page carries besides its pictures: the commenters'
  // avatars, reaction emojis, the star and black square used as overlays, the
  // placeholder for a withheld image, and site banners
  const kept = await page.evaluate(() => {
    const html = [
      '<a href="/pic/?bild=1" style="background-image:url(https://cc.example.com/pres/pic.php?id=1)"></a>',
      '<a href="/pic/?bild=2" style="background-image:url(https://cc.example.com/pres/pic_prof.php?id=9)"></a>',
      '<div style="background-image:url(https://cc.example.com/pres/layout/blackheart.png)"></div>',
      '<div style="background-image:url(https://cc.example.com/pres/layout/misc/whitestar.svg)"></div>',
      '<div style="background-image:url(https://cc.example.com/pres/layout/misc/emojis/u1f44d.svg)"></div>',
      '<div style="background-image:url(https://cc.example.com/pres/bild_def/_forbidden.png)"></div>',
      '<div style="background-image:url(https://cc.example.com/pres/bild_def/_ingen?3)"></div>',
      '<div style="background-image:url(https://cc.example.com/pres/layout/loading_balls.svg)"></div>',
      '<div style="background-image:url(https://cc.example.com/pres/bnrs/797.jpg)"></div>',
    ].join('');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return DiversiaPickers.imagesFrom(doc, 'https://example.com/pic/?id=250').map((i) => i.thumb);
  });
  assert.deepEqual(kept, ['https://cc.example.com/pres/pic.php?id=1']);
});

test('only your own pages are suggested, not the site-wide ones', async () => {
  const chips = await page.evaluate(() => {
    const nav = document.createElement('nav');
    nav.innerHTML = '<a href="/pic/?id=250">\u{1F5BC}️ Bilder</a>'
      + '<a href="/pic/">Bilder, 100.000-tals bilder</a>'
      + '<a href="/pic/?bild=82628">Persongalleriet</a>'
      + '<a href="/profil.php?id=250">Jungleland</a>';
    document.body.appendChild(nav);
    const r = DiversiaPickers.suggestions('gallery').map((x) => x.href);
    nav.remove();
    return r;
  });
  assert.deepEqual(chips.map((h) => h.replace(/^https?:\/\/[^/]+/, '')), ['/pic/?id=250']);
});
