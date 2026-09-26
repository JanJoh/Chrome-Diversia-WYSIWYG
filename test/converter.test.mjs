// Converter tests, run in a real Chromium DOM via Playwright.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = readFileSync(path.join(here, '..', 'src', 'diversia.js'), 'utf8');

let browser, page;
before(async () => {
  browser = await launchBrowser();
  page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="ed" contenteditable="true"></div>');
  await page.addScriptTag({ content: lib });
});
after(async () => { await browser?.close(); });

// markup -> DOM -> markup
const roundtrip = (markup) => page.evaluate((m) => {
  const ed = document.getElementById('ed');
  ed.replaceChildren(DiversiaMarkup.parse(m));
  return DiversiaMarkup.serialize(ed);
}, markup);

// arbitrary HTML (as a browser/paste would produce it) -> markup
const fromHtml = (html) => page.evaluate((h) => {
  const ed = document.getElementById('ed');
  ed.innerHTML = h;
  return DiversiaMarkup.serialize(ed);
}, html);

const same = [
  'Hejsan <font size=4 color=#FF0000>detta blir stort och rött</font> nu är texten vanlig igen',
  '<b><i>fet och kursiv text</i></b>',
  '<img src=https://www.mindoman.com/minbild.jpg>',
  '<img src=https://example.com/a.jpg width=50% align=center>',
  '<video https://www.youtube.com/watch?v=OlB2W6GKieo>',
  '<spotify spotify:user:strangelove:playlist:7iy05qrBghabEQrL4Keb2m>',
  '<soundcloud https://soundcloud.com/some/track>',
  '&lt;3 hearts and a <b>bold</b> move',
  '<m 12345>En medlem</m> says hi',
  '<alster 987>my story</alster>',
  '<box align=center bgcolor=#222222 padding=10 border=1 bordercolor=#C62828>Hej</box>',
  '<p align=center>centrerat</p>',
  '<center>mitten</center>',
  '<blockquote><font color=#999999><i>A caption</i></font></blockquote>',
  '<hr>',
  '<hr size=2 color=#C62828 width=50%>',
  'line one\nline two\n\nnew paragraph',
  '<a href=https://open.spotify.com/playlist/x>link</a>',
  '<font color=#ff0000 size=2>order and case kept</font>',
  '<pre>  ascii\n   art</pre>',
];

for (const m of same) {
  test(`roundtrip: ${m.slice(0, 50).replace(/\n/g, '⏎')}`, async () => {
    assert.equal(await roundtrip(m), m);
  });
}

test('mis-nested tags are repaired (last in, first out)', async () => {
  assert.equal(await roundtrip('<b><i>x</b></i> y'), '<b><i>x</i></b> y');
});

test('unknown tags stay visible as text', async () => {
  assert.equal(await roundtrip('a <blink>b</blink>'), 'a &lt;blink>b&lt;/blink>');
});

test('stray closing tags are dropped', async () => {
  assert.equal(await roundtrip('a</b> b'), 'a b');
});

test('non-https links and images are neutralised', async () => {
  assert.equal(await roundtrip('<a href=javascript:alert(1)>x</a><img src=http://x/y.png>'), 'x');
});

test('Chrome contenteditable lines (div per line) become newlines', async () => {
  assert.equal(await fromHtml('first<div>second</div><div><br></div><div>fourth</div>'), 'first\nsecond\n\nfourth');
});

test('execCommand output: font size/colour, bold, centre', async () => {
  assert.equal(await fromHtml('<font size="7" color="#c62828">big</font>'), '<font size=6 color=#C62828>big</font>');
  assert.equal(await fromHtml('<span style="font-weight: bold; color: rgb(198, 40, 40)">x</span>'), '<font color=#C62828><b>x</b></font>');
  assert.equal(await fromHtml('<div style="text-align: center;">mid</div>'), '<center>mid</center>');
});

test('pasted rich text is reduced to the whitelist', async () => {
  const md = await fromHtml('<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li><li>two</li></ul><script>alert(1)</script>');
  assert.equal(md, '<font size=5><b>Title</b></font>\nSome <b>bold</b> and <i>italic</i>.\n• one\n• two');
});

test('literal < in text is escaped', async () => {
  assert.equal(await fromHtml('a &lt;b&gt; c'), 'a &lt;b> c');
});

test('empty formatting is dropped', async () => {
  assert.equal(await fromHtml('a<b></b><i> </i>b'), 'a<i> </i>b');
});

// Real-world samples: every *.txt in test/samples must survive a roundtrip unchanged.
const samples = path.join(here, 'samples');
if (existsSync(samples)) {
  for (const f of readdirSync(samples).filter((x) => x.endsWith('.txt'))) {
    test(`sample roundtrip: ${f}`, async () => {
      const src = readFileSync(path.join(samples, f), 'utf8').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      assert.equal(await roundtrip(src), src);
    });
  }
}
