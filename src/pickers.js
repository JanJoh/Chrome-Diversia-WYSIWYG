/*
 * Pickers for the Diversia editor:
 *   imageDialog()  – choose an image from your own gallery on the site, or
 *                    paste any image address (with sanity checks), and set
 *                    width / alignment / border
 *   memberDialog() – choose a member from your friends list, or type a
 *                    member number
 *
 * Gallery and friends pages are read with same-origin fetches (your normal
 * logged-in session). Nothing is sent anywhere else. The page addresses are
 * remembered per site.
 */
(function (root) {
  'use strict';
  if (root.DiversiaPickers) return;
  const M = root.DiversiaMarkup;
  const sv = () => (document.documentElement.lang || navigator.language || 'sv').startsWith('sv');
  const t = (s, e) => (sv() ? s : e);

  // ------------------------------------------------------------ storage
  const ext = root.browser || root.chrome;   // Firefox/Safari: browser.*, Chrome: chrome.*
  const hasExtStorage = () => { try { return !!(ext && ext.storage && ext.storage.local); } catch (e) { return false; } };
  const Store = {
    key: (k) => 'dvw:' + k + '@' + location.host,
    async get(k) {
      try {
        if (hasExtStorage()) {
          const r = await ext.storage.local.get(Store.key(k));
          return r[Store.key(k)];
        }
      } catch (e) { /* fall back */ }
      try { return JSON.parse(localStorage.getItem(Store.key(k))); } catch (e) { return undefined; }
    },
    async set(k, v) {
      try {
        if (hasExtStorage()) { await ext.storage.local.set({ [Store.key(k)]: v }); return; }
      } catch (e) { /* fall back */ }
      try { localStorage.setItem(Store.key(k), JSON.stringify(v)); } catch (e) { /* private mode */ }
    },
  };

  // --------------------------------------------------- same-origin fetch
  const abs = (href, base) => {
    if (!href) return '';
    try { return new URL(href, base).href; } catch (e) { return ''; }
  };

  async function fetchDoc(url) {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) {
      throw new Error(t('Adressen måste vara en sida på samma sajt som du är inloggad på (' + location.host + ').',
        'The address must be a page on the site you are logged in to (' + location.host + ').'));
    }
    const res = await fetch(u.href, { credentials: 'include' });
    if (!res.ok) throw new Error(t('Kunde inte hämta sidan', 'Could not load the page') + ' (HTTP ' + res.status + ')');
    const buf = await res.arrayBuffer();
    let cs = (/charset=([\w-]+)/i.exec(res.headers.get('content-type') || '') || [])[1];
    if (!cs) {
      const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
      cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
    }
    let text;
    try { text = new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { text = new TextDecoder('utf-8').decode(buf); }
    return { doc: new DOMParser().parseFromString(text, 'text/html'), url: res.url || u.href };
  }

  // ------------------------------------------------------------ gallery
  const IMG_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;
  const SKIP_IMG = /(smil(ey|ie)|emoji|emoticon|icon|spacer|pixel|blank\.|button|arrow|logo|badge|flag|loading)/i;

  // Diversia draws gallery thumbnails as inline background-image on the link
  // itself rather than with <img>, so both have to be read.
  const BG_URL = /background-image\s*:\s*url\((['"]?)([^)'"]+)\1\)/i;

  function imagesFrom(doc, base) {
    const out = [];
    doc.querySelectorAll('img').forEach((img) => {
      const src = abs(img.getAttribute('src') || img.getAttribute('data-src'), base);
      if (!src) return;
      const w = parseInt(img.getAttribute('width'), 10) || 0;
      const h = parseInt(img.getAttribute('height'), 10) || 0;
      if ((w && w < 40) || (h && h < 40) || SKIP_IMG.test(src)) return;
      const a = img.closest('a');
      const href = a ? abs(a.getAttribute('href'), base) : '';
      const full = href && IMG_EXT.test(href) ? href : src;
      out.push({ thumb: src, full, link: href, title: (img.getAttribute('alt') || img.getAttribute('title') || '').trim() });
    });
    doc.querySelectorAll('[style*="background-image"]').forEach((el) => {
      const m = BG_URL.exec(el.getAttribute('style') || '');
      if (!m) return;
      const src = abs(m[2], base);
      if (!src || SKIP_IMG.test(src)) return;
      const a = el.closest('a');
      const href = a ? abs(a.getAttribute('href'), base) : '';
      const full = href && IMG_EXT.test(href) ? href : src;
      const title = (el.getAttribute('title') || (a && a.getAttribute('title')) || '').trim();
      out.push({ thumb: src, full, link: href, title });
    });
    return out;
  }

  const ALBUM_LINK = /(album|galleri|gallery|bilder|foto|photos|[?&](page|sida|p|start|offset)=\d+)/i;

  /*
   * Pages worth reading next, and nothing else.
   *
   * When the gallery address carries your member number, only two kinds of
   * link count: one that carries the same number, and an album cover (a link
   * that is itself a thumbnail). That leaves out the site's own shortcuts --
   * "100.000-tals bilder", "Persongalleriet" -- which otherwise look exactly
   * like album links and lead into everybody else's pictures. Nothing outside
   * the gallery's own folder is followed either, which rules out the edit and
   * upload controls sitting next to each album.
   */
  function albumLinks(doc, base, memberId) {
    const from = new URL(base);
    const dir = from.pathname.replace(/[^/]*$/, '');
    const out = [];
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = abs(a.getAttribute('href'), base);
      if (!href || IMG_EXT.test(href) || !href.startsWith(from.origin)) return;
      const path = new URL(href).pathname;
      if (memberId) {
        // Only another view of this same page counts: an album cover, or a
        // link carrying your member number. The rest of what sits next to a
        // gallery -- profile, guestbook, diary, interview, friends list -- is
        // reached by relative links that land in the same folder and carry the
        // same number, so the folder alone is not a narrow enough test.
        if (path !== from.pathname) return;
        const mine = new RegExp('(?:^|[^0-9])' + memberId + '(?![0-9])').test(href);
        const cover = BG_URL.test(a.getAttribute('style') || '') ||
          !!a.querySelector('[style*="background-image"], img');
        if (!mine && !cover) return;
      } else {
        if (path.replace(/[^/]*$/, '') !== dir) return;
        if (!(ALBUM_LINK.test(href) || ALBUM_LINK.test(a.textContent || ''))) return;
      }
      out.push(href.split('#')[0]);
    });
    return [...new Set(out)];
  }

  /*
   * The gallery is read a page at a time, when you ask for it.
   *
   * Opening the picker reads one page: your gallery's front page, which lists
   * your albums and already carries a cover picture for each. Opening an album
   * reads one more. Nothing is fetched speculatively and nothing recurses --
   * the site has anti-scraping measures, and a click is the only thing that
   * causes a request.
   */
  function dedupe(list) {
    const seen = new Set(); const out = [];
    for (const im of list) {
      if (!M.isHttps(im.full) || seen.has(im.full)) continue;
      seen.add(im.full); out.push(im);
    }
    return out;
  }

  // The gallery front page: { albums: [{href, name, cover}], images } where
  // images are any pictures that aren't an album cover.
  async function scanIndex(startUrl) {
    const page = await fetchDoc(abs(startUrl, location.href));
    const links = albumLinks(page.doc, page.url, idOf(page.url));
    const isAlbum = new Set(links);
    isAlbum.delete(page.url.split('#')[0]);   // the gallery is not its own album
    const albums = new Map();
    page.doc.querySelectorAll('a[href]').forEach((a) => {
      const href = abs(a.getAttribute('href'), page.url).split('#')[0];
      if (!isAlbum.has(href)) return;
      const name = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
      const rec = albums.get(href) || { href, name: '', cover: '' };
      if (!rec.name && name && name.length <= 60) rec.name = name;
      albums.set(href, rec);
    });
    const loose = [];
    for (const im of imagesFrom(page.doc, page.url)) {
      const rec = albums.get(im.link);
      if (rec) { if (!rec.cover && M.isHttps(im.thumb)) rec.cover = im.thumb; if (!rec.name && im.title) rec.name = im.title; }
      else loose.push(im);
    }
    // An album worth showing has a cover: that is what tells a real album from
    // the sorting and paging links sitting beside it. Where a gallery has no
    // covers at all, fall back to any named link that looked like an album.
    const all = [...albums.values()];
    const withCover = all.filter((x) => x.cover);
    return { albums: withCover.length ? withCover : all.filter((x) => x.name), images: dedupe(loose) };
  }

  // One album, read only when it is opened.
  async function scanAlbum(url) {
    const page = await fetchDoc(abs(url, location.href));
    return dedupe(imagesFrom(page.doc, page.url));
  }

  // ------------------------------------------------------------ friends
  const ID_PATTERNS = [
    /[?&](?:id|uid|user|userid|member|memberid|medlem|medlemsnr|mid|mnr)=(\d+)/i,
    /\/(?:medlem|medlemmar|member|members|user|users|profil|profile|presentation)\/(\d+)/i,
  ];
  function membersFrom(doc, base) {
    const map = new Map();
    doc.querySelectorAll('a[href]').forEach((a) => {
      if (a.closest('nav, header, footer, [role=navigation], [role=banner]')) return;  // site menus, not friends
      const href = abs(a.getAttribute('href'), base);
      if (!href) return;
      let id = '';
      for (const re of ID_PATTERNS) { const m = re.exec(href); if (m) { id = m[1]; break; } }
      if (!id) return;
      const img = a.querySelector('img');
      let name = (a.textContent || '').replace(/\s+/g, ' ').trim() ||
        (img && (img.getAttribute('alt') || img.getAttribute('title')) || '').trim() || (a.getAttribute('title') || '').trim();
      if (name.length > 40 || /^\d+$/.test(name)) name = '';
      if (!map.has(id) || (!map.get(id).name && name)) map.set(id, { id, name });
    });
    return [...map.values()].filter((m) => m.name)
      .sort((x, y) => x.name.localeCompare(y.name, 'sv', { sensitivity: 'base' }));
  }

  // links in the site's own navigation that look like the page we need
  function suggestions(kind) {
    const re = kind === 'gallery'
      ? /(mina bilder|mitt galleri|galleri|album|bilder|my photos|gallery|photos)/i
      : /(mina vänner|vänner|vänlista|kompisar|kontakter|friends|contacts)/i;
    const out = new Map();
    document.querySelectorAll('a[href]').forEach((a) => {
      const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const href = abs(a.getAttribute('href'), location.href);
      if (!href || !href.startsWith(location.origin) || !text || text.length > 40) return;
      if (re.test(text) && !out.has(href)) out.set(href, text);
    });
    return [...out.entries()].slice(0, 6).map(([href, text]) => ({ href, text }));
  }

  /*
   * Your own page on the site, guessed from its own menu, so the first use of
   * a picker doesn't have to start with pasting an address.
   *
   * The member number is the key: your gallery and your friends list both
   * carry it, the site-wide versions don't. The parameter holding it is not
   * always called "id" -- diversia.social uses /pic/?id=250 for the gallery
   * but fav.php?offpage=250 for the friends list -- so the number itself is
   * what we look for, not a parameter name. Returns '' when nothing looks
   * personal, which leaves the old paste-an-address flow alone.
   */
  const ID_IN = [/[?&](?:id|medlem|member|user|uid)=(\d+)/i, /\/(?:medlem|member|profil|profile|user)\/(\d+)/i];
  const idOf = (href) => { for (const re of ID_IN) { const m = href.match(re); if (m) return m[1]; } return ''; };

  // Your own number is the one that dominates the page's profile links: a
  // friend turns up once or twice in a list, you turn up in the header, the
  // menu and every link back to your own pages.
  function ownId() {
    const counts = new Map();
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!/profil|profile|medlem|member|user/i.test(href)) return;
      const id = idOf(href);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    let best = '';
    let top = 0;
    counts.forEach((n, id) => { if (n > top) { best = id; top = n; } });
    return best;
  }

  function autoUrl(kind) {
    const cands = suggestions(kind);
    const me = ownId();
    if (me) {
      const mine = cands.find((s) => new RegExp('(?:^|[^0-9])' + me + '(?![0-9])').test(s.href));
      if (mine) return mine.href;
    }
    const withId = cands.filter((s) => idOf(s.href));
    return withId.length ? withId[0].href : '';
  }

  // ------------------------------------------------ image URL sanity check
  function loadImage(url, timeoutMs) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs || 10000);
      img.onload = () => { clearTimeout(timer); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
  }

  async function checkImageUrl(raw) {
    const res = { ok: false, url: '', warnings: [], error: '', width: 0, height: 0 };
    let s = String(raw || '').trim().replace(/^[<"']+|[>"']+$/g, '');
    if (!s) { res.error = t('Klistra in en bildadress.', 'Paste an image address.'); return res; }
    if (/^(data|blob|file):/i.test(s)) {
      res.error = t('Det där är en bild på din egen dator. Diversia kan bara visa bilder som ligger på webben (https://). Ladda upp den till ditt galleri först.',
        "That's an image on your own computer. Diversia can only show images that are on the web (https://). Upload it to your gallery first.");
      return res;
    }
    if (/\s/.test(s)) { res.error = t('Adressen innehåller mellanslag, så det är nog ingen bildadress.', 'The address contains spaces, so it is probably not an image address.'); return res; }
    if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    let u;
    try { u = new URL(s); } catch (e) { res.error = t('Det där är ingen giltig adress.', "That isn't a valid address."); return res; }

    const local = M.settings.allowInsecureLocal && /^(127\.0\.0\.1|localhost)$/.test(u.hostname);
    if (!local && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) {
      res.error = t('Det där ser inte ut som en webbadress.', "That doesn't look like a web address."); return res;
    }
    if (u.protocol === 'http:' && !local) {
      u.protocol = 'https:';
      res.warnings.push(t('Diversia kräver https – jag provar https-versionen av adressen.', 'Diversia requires https, so I tried the https version of the address.'));
    } else if (u.protocol !== 'https:' && !local) {
      res.error = t('Adressen måste börja med https://', 'The address must start with https://'); return res;
    }
    // common "page instead of image" links that can be fixed automatically
    if (/^(www\.)?imgur\.com$/i.test(u.hostname) && /^\/\w{5,8}$/.test(u.pathname)) {
      u = new URL('https://i.imgur.com' + u.pathname + '.jpg');
      res.warnings.push(t('Det var en imgur-sida – jag använder bildens direktadress i stället.', 'That was an imgur page, so I used the direct image address instead.'));
    }
    if (/dropbox\.com$/i.test(u.hostname) && u.searchParams.get('dl') === '0') {
      u.searchParams.set('raw', '1'); u.searchParams.delete('dl');
      res.warnings.push(t('Dropbox-länken ändrades så att den visar själva bilden.', 'The Dropbox link was changed so it shows the image itself.'));
    }
    if (/(^|\.)drive\.google\.com$/i.test(u.hostname) || /photos\.(app\.goo\.gl|google\.com)/i.test(u.host)) {
      res.warnings.push(t('Google Drive/Foton-länkar fungerar sällan som bild på andra sajter.', 'Google Drive/Photos links rarely work as images on other sites.'));
    }
    res.url = u.href;
    const dim = await loadImage(res.url);
    if (!dim) {
      res.error = IMG_EXT.test(u.pathname)
        ? t('Bilden gick inte att ladda. Adressen kan vara fel, bilden borttagen, eller så tillåter sajten inte att bilden visas någon annanstans.',
          "The image didn't load. The address may be wrong, the image removed, or the site doesn't allow it to be shown elsewhere.")
        : t('Adressen verkar gå till en webbsida, inte till en bild. Högerklicka på själva bilden och välj "Kopiera bildadress".',
          'The address seems to point to a web page, not an image. Right-click the image itself and choose "Copy image address".');
      return res;
    }
    res.ok = true; res.width = dim.width; res.height = dim.height;
    if (dim.width > 1400) {
      res.warnings.push(t('Bilden är ' + dim.width + ' px bred – överväg en mindre storlek nedan.', 'The image is ' + dim.width + ' px wide – consider a smaller size below.'));
    }
    return res;
  }

  // --------------------------------------------------------------- modal
  function h(tag, props, kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach((c) => c && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }

  function modal(title) {
    const prevFocus = document.activeElement;
    const body = h('div', { class: 'dvw-modal-body' });
    const footer = h('div', { class: 'dvw-modal-footer' });
    const panel = h('div', { class: 'dvw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'dvw-modal-head' }, [h('span', { text: title }),
        h('button', { type: 'button', class: 'dvw-x', 'aria-label': t('Stäng', 'Close'), text: '×', onclick: () => close() })]),
      body, footer,
    ]);
    const overlay = h('div', { class: 'dvw-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, [panel]);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    return { body, footer, close, panel };
  }

  function tabs(defs) {
    const bar = h('div', { class: 'dvw-tabs', role: 'tablist' });
    const panes = h('div', { class: 'dvw-panes' });
    const api = { bar, panes, show: null };
    defs.forEach((d, i) => {
      const b = h('button', { type: 'button', class: 'dvw-tab', role: 'tab', text: d.label, 'data-tab': d.id });
      const p = h('div', { class: 'dvw-pane', role: 'tabpanel', 'data-pane': d.id }, [d.content]);
      b.addEventListener('click', () => api.show(d.id));
      bar.appendChild(b); panes.appendChild(p);
    });
    api.show = (id) => {
      bar.querySelectorAll('.dvw-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      panes.querySelectorAll('.dvw-pane').forEach((p) => { p.hidden = p.dataset.pane !== id; });
      const d = defs.find((x) => x.id === id);
      if (d && d.onShow) d.onShow();
    };
    return api;
  }

  // a "page address" row with suggestions from the site's own navigation
  function sourceRow(kind, placeholder, initial, onLoad) {
    const input = h('input', { type: 'url', class: 'dvw-input', placeholder, value: initial || '' });
    const go = h('button', { type: 'button', class: 'dvw-btn', text: t('Hämta', 'Load') });
    const run = () => { if (input.value.trim()) onLoad(input.value.trim()); };
    go.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    const sug = suggestions(kind);
    const chips = sug.length ? h('div', { class: 'dvw-chips' }, [
      h('span', { class: 'dvw-muted', text: t('Förslag från sidan: ', 'Suggestions from this page: ') }),
      ...sug.map((s) => h('button', {
        type: 'button', class: 'dvw-chip', text: s.text, title: s.href,
        onclick: () => { input.value = s.href; run(); },
      })),
    ]) : null;
    return { el: h('div', { class: 'dvw-source-row' }, [h('div', { class: 'dvw-row' }, [input, go]), chips]), input, run };
  }

  // ---------------------------------------------------------- image dialog
  const SIZES = [
    { v: '', l: () => t('Originalstorlek', 'Original size') },
    { v: '25%', l: () => t('Liten (25 %)', 'Small (25%)') },
    { v: '50%', l: () => t('Mellan (50 %)', 'Medium (50%)') },
    { v: '75%', l: () => t('Stor (75 %)', 'Large (75%)') },
    { v: '100%', l: () => t('Full bredd (100 %)', 'Full width (100%)') },
    { v: 'px', l: () => t('Egen bredd i pixlar…', 'Custom width in pixels…') },
  ];

  /*
   * opts: { initial: {src, attrs}, galleryUrl, onInsert(src, attrs), onRemove() }
   * attrs are Diversia attribute pairs: [{key:'width', value:'50%'}, …]
   */
  function imageDialog(opts) {
    const editing = !!(opts.initial && opts.initial.src);
    const m = modal(editing ? t('Ändra bild', 'Edit image') : t('Infoga bild', 'Insert image'));
    let chosen = editing ? opts.initial.src : '';
    let checkedOk = editing;

    // ---- options (shared)
    const getA = (k) => { const a = ((opts.initial && opts.initial.attrs) || []).find((x) => x.key === k); return a ? a.value : ''; };
    const w0 = getA('width');
    const sizeSel = h('select', { class: 'dvw-select dvw-img-size' }, SIZES.map((s) => h('option', { value: s.v, text: s.l() })));
    const pxInput = h('input', { type: 'number', min: '16', max: '2000', step: '10', class: 'dvw-input dvw-px', placeholder: 'px' });
    if (/^\d+%$/.test(w0) && SIZES.some((s) => s.v === w0)) sizeSel.value = w0;
    else if (/^\d+$/.test(w0)) { sizeSel.value = 'px'; pxInput.value = w0; }
    const syncPx = () => { pxInput.hidden = sizeSel.value !== 'px'; };
    sizeSel.addEventListener('change', () => { syncPx(); updatePreview(); });
    pxInput.addEventListener('input', updatePreview);
    syncPx();
    const alignSel = h('select', { class: 'dvw-select dvw-img-align' }, [
      ['', t('Ingen justering', 'No alignment')], ['left', t('Vänster (text runt)', 'Left (text wraps)')],
      ['center', t('Centrerad', 'Centred')], ['right', t('Höger (text runt)', 'Right (text wraps)')],
    ].map(([v, l]) => h('option', { value: v, text: l })));
    alignSel.value = getA('align').toLowerCase();
    alignSel.addEventListener('change', updatePreview);
    const borderSel = h('select', { class: 'dvw-select dvw-img-border' }, ['0', '1', '2', '3', '5'].map((v) =>
      h('option', { value: v, text: v === '0' ? t('Ingen ram', 'No border') : t('Ram ', 'Border ') + v + ' px' })));
    borderSel.value = getA('border') || '0';
    borderSel.addEventListener('change', updatePreview);

    const previewImg = h('img', { class: 'dvw-preview-img', alt: '' });
    const previewBox = h('div', { class: 'dvw-preview' }, [previewImg, h('span', { class: 'dvw-muted dvw-preview-note', text: t('Förhandsvisning', 'Preview') })]);
    const attrs = () => {
      const out = [];
      const b = borderSel.value; if (b && b !== '0') out.push({ key: 'border', value: b });
      let w = sizeSel.value;
      if (w === 'px') w = String(Math.max(16, Math.min(2000, parseInt(pxInput.value, 10) || 0)) || '');
      if (w && w !== '0') out.push({ key: 'width', value: w });
      const hgt = getA('height'); if (hgt && !w) out.push({ key: 'height', value: hgt });
      if (alignSel.value) out.push({ key: 'align', value: alignSel.value });
      return out;
    };
    function updatePreview() {
      previewBox.hidden = !chosen;
      if (!chosen) return;
      if (previewImg.getAttribute('src') !== chosen) previewImg.src = chosen;
      M.styleImage(previewImg, attrs());
      previewImg.style.maxHeight = '180px';
      updateButton();
    }
    const optionsEl = h('div', { class: 'dvw-img-options' }, [
      h('label', {}, [t('Storlek ', 'Size '), sizeSel, pxInput]),
      h('label', {}, [t('Placering ', 'Position '), alignSel]),
      h('label', {}, [borderSel]),
    ]);

    // ---- gallery tab
    //
    // Two views in one pane: your albums, and the pictures inside one album.
    // Only a click fetches anything.
    const grid = h('div', { class: 'dvw-grid' });
    const gStatus = h('div', { class: 'dvw-status' });
    const gBack = h('button', { type: 'button', class: 'dvw-btn dvw-back', text: t('\u2190 Alla album', '\u2190 All albums') });
    const gBar = h('div', { class: 'dvw-crumbs' }, [gBack]);
    gBar.hidden = true;

    const pickThumb = (im, b) => {
      grid.querySelectorAll('.dvw-thumb').forEach((x) => x.classList.remove('dvw-selected'));
      b.classList.add('dvw-selected');
      chosen = im.full; checkedOk = true; updatePreview();
    };
    const addThumb = (im) => {
      const b = h('button', { type: 'button', class: 'dvw-thumb', title: im.title || im.full, 'data-full': im.full }, [
        h('img', { src: im.thumb, alt: im.title || '', loading: 'lazy', referrerpolicy: 'no-referrer' })]);
      b.addEventListener('click', () => pickThumb(im, b));
      grid.appendChild(b);
    };

    let indexUrl = '';
    async function openAlbum(album) {
      grid.replaceChildren();
      gBar.hidden = false;
      gStatus.className = 'dvw-status';
      gStatus.textContent = t('Hämtar ' + (album.name || 'albumet') + '…', 'Loading ' + (album.name || 'the album') + '…');
      try {
        const imgs = await scanAlbum(album.href);
        if (!imgs.length) { gStatus.className = 'dvw-status dvw-warn'; gStatus.textContent = t('Inga bilder i det albumet.', 'No images in that album.'); return; }
        gStatus.textContent = t(album.name + ': ' + imgs.length + ' bilder. Klicka på en för att välja den.',
          album.name + ': ' + imgs.length + ' images. Click one to choose it.');
        imgs.forEach(addThumb);
      } catch (e) { gStatus.className = 'dvw-status dvw-error'; gStatus.textContent = e.message; }
    }

    async function openIndex(url) {
      indexUrl = url;
      grid.replaceChildren();
      gBar.hidden = true;
      gStatus.className = 'dvw-status'; gStatus.textContent = t('Hämtar…', 'Loading…');
      try {
        const { albums, images } = await scanIndex(url);
        await Store.set('galleryUrl', url);
        if (!albums.length && !images.length) {
          gStatus.className = 'dvw-status dvw-warn';
          gStatus.textContent = t('Hittade inga bilder på den sidan. Är det rätt adress?', 'No images found on that page. Is it the right address?');
          return;
        }
        gStatus.textContent = albums.length
          ? t(albums.length + ' album. Klicka på ett för att se bilderna.', albums.length + ' albums. Click one to see its images.')
          : t(images.length + ' bilder. Klicka på en för att välja den.', images.length + ' images. Click one to choose it.');
        albums.forEach((al) => {
          const b = h('button', { type: 'button', class: 'dvw-albumcard', title: al.name }, [
            al.cover ? h('img', { src: al.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'dvw-albumempty', text: '\u{1F5BC}' }),
            h('span', { class: 'dvw-albumname', text: al.name || t('Album', 'Album') }),
          ]);
          b.addEventListener('click', () => openAlbum(al));
          grid.appendChild(b);
        });
        images.forEach(addThumb);
      } catch (e) { gStatus.className = 'dvw-status dvw-error'; gStatus.textContent = e.message; }
    }

    gBack.addEventListener('click', () => { if (indexUrl) openIndex(indexUrl); });
    const gallery = sourceRow('gallery', t('Adress till ditt galleri på sajten', 'Address of your gallery page on the site'), '', openIndex);
    const galleryPane = h('div', {}, [gallery.el, gBar, gStatus, grid]);

    // ---- URL tab
    const urlInput = h('input', { type: 'url', class: 'dvw-input dvw-img-url', placeholder: 'https://…' });
    const checkBtn = h('button', { type: 'button', class: 'dvw-btn dvw-check', text: t('Kontrollera', 'Check') });
    const uStatus = h('div', { class: 'dvw-status' });
    const runCheck = async () => {
      uStatus.className = 'dvw-status'; uStatus.textContent = t('Kontrollerar…', 'Checking…');
      chosen = ''; checkedOk = false; updatePreview(); updateButton();
      const r = await checkImageUrl(urlInput.value);
      const lines = [];
      if (r.ok) lines.push(t('✓ Det är en bild', '✓ It is an image') + ' (' + r.width + ' × ' + r.height + ' px).');
      r.warnings.forEach((w) => lines.push('• ' + w));
      if (r.error) lines.push(r.error);
      uStatus.className = 'dvw-status ' + (r.ok ? (r.warnings.length ? 'dvw-warn' : 'dvw-ok') : 'dvw-error');
      uStatus.textContent = lines.join('\n');
      if (r.url) { urlInput.value = r.url; }
      if (r.ok) { chosen = r.url; checkedOk = true; }
      else if (r.url && /^https:/.test(r.url)) { chosen = r.url; checkedOk = false; }  // allow "insert anyway"
      updatePreview(); updateButton();
    };
    checkBtn.addEventListener('click', runCheck);
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runCheck(); } });
    urlInput.addEventListener('paste', () => setTimeout(runCheck, 0));
    const urlPane = h('div', {}, [h('div', { class: 'dvw-row' }, [urlInput, checkBtn]), uStatus]);

    // ---- footer
    const insertBtn = h('button', { type: 'button', class: 'dvw-btn dvw-primary dvw-insert' });
    function updateButton() {
      insertBtn.disabled = !chosen;
      insertBtn.textContent = editing ? t('Uppdatera', 'Update') : (chosen && !checkedOk ? t('Infoga ändå', 'Insert anyway') : t('Infoga', 'Insert'));
    }
    insertBtn.addEventListener('click', () => { if (!chosen) return; m.close(); opts.onInsert(chosen, attrs()); });
    const cancel = h('button', { type: 'button', class: 'dvw-btn', text: t('Avbryt', 'Cancel'), onclick: () => m.close() });
    if (editing && opts.onRemove) {
      m.footer.appendChild(h('button', { type: 'button', class: 'dvw-btn dvw-danger', text: t('Ta bort bild', 'Remove image'),
        onclick: () => { m.close(); opts.onRemove(); } }));
    }
    m.footer.appendChild(h('span', { class: 'dvw-spacer' }));
    m.footer.appendChild(cancel); m.footer.appendChild(insertBtn);

    if (!editing) {
      const tb = tabs([
        { id: 'gallery', label: t('Mitt galleri', 'My gallery'), content: galleryPane },
        { id: 'url', label: t('Bildadress (URL)', 'Image address (URL)'), content: urlPane, onShow: () => urlInput.focus() },
      ]);
      m.body.appendChild(tb.bar); m.body.appendChild(tb.panes);
      Store.get('galleryUrl').then((saved) => {
        const start = saved || opts.galleryUrl || autoUrl('gallery');
        gallery.input.value = start;
        if (start) { tb.show('gallery'); gallery.run(); } else tb.show('url');
      });
    }
    m.body.appendChild(h('div', { class: 'dvw-divider' }));
    m.body.appendChild(optionsEl);
    m.body.appendChild(previewBox);
    updatePreview(); updateButton();
    return m;
  }

  // --------------------------------------------------------- member dialog
  /* opts: { friendsUrl, selectedText, onInsert(id, name) } */
  function memberDialog(opts) {
    const m = modal(t('Länk till medlem', 'Link to member'));
    const list = h('div', { class: 'dvw-list', role: 'listbox' });
    const status = h('div', { class: 'dvw-status' });
    const search = h('input', { type: 'search', class: 'dvw-input dvw-member-search', placeholder: t('Sök bland vänner…', 'Search friends…') });
    let members = [];
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = members.filter((x) => !q || x.name.toLowerCase().includes(q) || x.id.includes(q));
      list.replaceChildren(...shown.slice(0, 300).map((x) => h('button', {
        type: 'button', class: 'dvw-member', role: 'option', 'data-id': x.id,
        onclick: () => { m.close(); opts.onInsert(x.id, x.name); },
      }, [h('span', { text: x.name }), h('span', { class: 'dvw-muted', text: ' #' + x.id })])));
      if (members.length && !shown.length) list.appendChild(h('div', { class: 'dvw-muted', text: t('Ingen träff.', 'No match.') }));
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = list.querySelector('.dvw-member'); if (first) { e.preventDefault(); first.click(); } }
    });
    const friends = sourceRow('friends', t('Adress till din vänlista på sajten', 'Address of your friends list on the site'), '', async (url) => {
      status.className = 'dvw-status'; status.textContent = t('Hämtar…', 'Loading…'); list.replaceChildren();
      try {
        const page = await fetchDoc(url);
        members = membersFrom(page.doc, page.url);
        await Store.set('friendsUrl', url);
        if (!members.length) { status.className = 'dvw-status dvw-warn'; status.textContent = t('Hittade inga medlemslänkar på den sidan. Är det rätt adress?', 'No member links found on that page. Is it the right address?'); return; }
        status.textContent = t(members.length + ' vänner.', members.length + ' friends.');
        render(); search.focus();
      } catch (e) { status.className = 'dvw-status dvw-error'; status.textContent = e.message; }
    });
    const friendsPane = h('div', {}, [friends.el, status, search, list]);

    const numInput = h('input', { type: 'text', inputmode: 'numeric', class: 'dvw-input dvw-member-number', placeholder: '12345' });
    const nameInput = h('input', { type: 'text', class: 'dvw-input dvw-member-name', placeholder: t('Text som visas (t.ex. namnet)', 'Text to show (e.g. the name)'), value: opts.selectedText || '' });
    const nStatus = h('div', { class: 'dvw-status' });
    const addNum = () => {
      const id = numInput.value.replace(/\D/g, '');
      if (!id) { nStatus.className = 'dvw-status dvw-error'; nStatus.textContent = t('Skriv ett medlemsnummer (bara siffror). Det står längst ner på medlemmens presentation.', "Type a member number (digits only). It's at the bottom of the member's presentation."); return; }
      m.close(); opts.onInsert(id, nameInput.value.trim());
    };
    numInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNum(); } });
    const numberPane = h('div', {}, [
      h('div', { class: 'dvw-row' }, [numInput, nameInput]),
      h('div', { class: 'dvw-row' }, [h('button', { type: 'button', class: 'dvw-btn dvw-primary dvw-add-number', text: t('Infoga', 'Insert'), onclick: addNum })]),
      nStatus,
    ]);
    const tb = tabs([
      { id: 'friends', label: t('Mina vänner', 'My friends'), content: friendsPane, onShow: () => search.focus() },
      { id: 'number', label: t('Medlemsnummer', 'Member number'), content: numberPane, onShow: () => numInput.focus() },
    ]);
    m.body.appendChild(tb.bar); m.body.appendChild(tb.panes);
    m.footer.appendChild(h('span', { class: 'dvw-spacer' }));
    m.footer.appendChild(h('button', { type: 'button', class: 'dvw-btn', text: t('Avbryt', 'Cancel'), onclick: () => m.close() }));
    Store.get('friendsUrl').then((saved) => {
      const start = saved || opts.friendsUrl || autoUrl('friends');
      friends.input.value = start;
      if (start) { tb.show('friends'); friends.run(); } else tb.show('number');
    });
    return m;
  }

  root.DiversiaPickers = { imageDialog, memberDialog, checkImageUrl, scanIndex, scanAlbum, imagesFrom, membersFrom, albumLinks, suggestions, autoUrl, Store };
})(typeof globalThis !== 'undefined' ? globalThis : this);
