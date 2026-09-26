/*
 * DiversiaEditor: a WYSIWYG editor bound to a <textarea> that holds
 * Diversia markup. The textarea stays in the page (hidden while the editor
 * is on) and is kept in sync, so the site's own form submission is untouched.
 *
 *   const ed = DiversiaEditor.attach(textarea);   // shows the editor
 *   ed.detach();                                   // back to the plain textarea
 */
(function (root) {
  'use strict';
  if (root.DiversiaEditor) return;  // already loaded in this world
  const M = root.DiversiaMarkup;
  const ATTACHED = new WeakMap();
  const t = (sv, en) => ((document.documentElement.lang || navigator.language || 'sv').startsWith('sv') ? sv : en);

  const COLORS = ['#C62828', '#E57373', '#F9A825', '#2E7D32', '#1565C0', '#6A1B9A', '#999999', '#FFFFFF', '#000000'];

  function el(tag, props, children) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (children || []).forEach((c) => e.appendChild(c));
    return e;
  }

  function attach(textarea, opts) {
    if (ATTACHED.has(textarea)) return ATTACHED.get(textarea);
    opts = opts || {};
    const cs = getComputedStyle(textarea);
    const wrapper = el('div', { class: 'dvw-wrapper' });
    const area = el('div', {
      class: 'dvw-area', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
      spellcheck: textarea.spellcheck ? 'true' : 'false',
    });
    area.style.minHeight = Math.max(160, textarea.offsetHeight || 0) + 'px';
    // Look like the published post, not like the code box: use the page's own
    // font and the colours of the nearest element that has a background.
    const bodyCs = getComputedStyle(document.body);
    area.style.fontFamily = bodyCs.fontFamily;
    area.style.fontSize = bodyCs.fontSize;
    const transparent = (c) => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
    let host = textarea.parentElement;
    while (host && transparent(getComputedStyle(host).backgroundColor)) host = host.parentElement;
    const hostCs = getComputedStyle(host || document.documentElement);
    if (!transparent(hostCs.backgroundColor)) area.style.backgroundColor = hostCs.backgroundColor;
    area.style.color = hostCs.color || cs.color;

    let sourceMode = false;
    let lastMarkup = null;

    // ---------------------------------------------------------- sync
    function load(markup) {
      area.replaceChildren(M.parse(markup || ''));
      lastMarkup = M.serialize(area);
    }
    function sync() {
      if (sourceMode) return;
      const markup = M.serialize(area);
      if (markup === lastMarkup) return;
      lastMarkup = markup;
      textarea.value = markup;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      if (opts.onChange) opts.onChange(markup);
    }
    /*
     * The page's own controls still write to the textarea while it is hidden.
     * Diversia's emoji picker does exactly that: insertAtCursor() puts the
     * character straight into the box, so nothing appears in the editor, and
     * the next keystroke serialises the editor over it and the emoji is gone.
     * Anything written from outside is adopted into the editor instead.
     */
    function adoptOutsideEdit() {
      if (sourceMode || !ATTACHED.has(textarea)) return;
      const outside = textarea.value;
      if (outside === lastMarkup) return;
      const focused = area.contains(document.activeElement) || document.activeElement === area;
      load(outside);
      // keep the box and the editor agreed, so this doesn't fire again
      lastMarkup = M.serialize(area);
      textarea.value = lastMarkup;
      if (focused) {
        const r = document.createRange();
        r.selectNodeContents(area);
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      if (opts.onChange) opts.onChange(lastMarkup);
    }
    // Capture runs before the page's own click handler, so look afterwards.
    const onDocClick = () => setTimeout(adoptOutsideEdit, 0);
    document.addEventListener('click', onDocClick, true);

    const observer = new MutationObserver(sync);
    observer.observe(area, { childList: true, subtree: true, characterData: true, attributes: true });

    // ------------------------------------------------------ commands
    function focus() { area.focus(); }
    // Keep track of the caret so toolbar taps (which may steal focus on touch
    // devices and in Safari) always act on the text the user had selected.
    let lastRange = null;
    const onSelChange = () => {
      const sel = getSelection();
      if (sel.rangeCount && area.contains(sel.getRangeAt(0).commonAncestorContainer)) lastRange = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSelChange);
    function ensureSelection() {
      const sel = getSelection();
      const inside = sel.rangeCount && area.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (document.activeElement !== area) area.focus({ preventScroll: true });
      if (!inside && lastRange) { sel.removeAllRanges(); sel.addRange(lastRange); }
    }
    function exec(cmd, val) {
      ensureSelection();
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(cmd, false, val);
      sync();
    }
    function selectionRange() {
      const sel = getSelection();
      if (!sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      return area.contains(r.commonAncestorContainer) ? r : null;
    }
    function insertNode(node) {
      ensureSelection();
      let r = selectionRange();
      if (!r) { r = document.createRange(); r.selectNodeContents(area); r.collapse(false); }
      const last = node.nodeType === 11 ? node.lastChild : node;
      r.deleteContents();
      r.insertNode(node);
      // put the caret right after what was inserted
      const caret = document.createRange();
      if (last && last.parentNode) caret.setStartAfter(last); else caret.setStart(r.endContainer, r.endOffset);
      caret.collapse(true);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(caret);
      sync();
    }
    function insertMarkup(markup) { insertNode(M.parse(markup)); }
    function wrapSelection(markupOpen, markupClose) {
      ensureSelection();
      const r = selectionRange();
      const holder = document.createElement('div');
      if (r && !r.collapsed) holder.appendChild(r.cloneContents());
      const inner = M.serialize(holder) || t('text', 'text');
      insertMarkup(markupOpen + inner + markupClose);
    }
    let savedRange = null;
    function saveRange() { ensureSelection(); const r = selectionRange(); savedRange = r ? r.cloneRange() : null; }
    function restoreRange() {
      area.focus();
      if (!savedRange) return;
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(savedRange);
    }
    const P = () => root.DiversiaPickers;
    const attrStr = (attrs) => attrs.map((a) => ' ' + a.key + '=' + a.value).join('');
    const esc = (s) => String(s).replace(/</g, '&lt;');
    function editImage(img) {
      if (!P()) return;
      const attrs = JSON.parse(img.getAttribute('data-dv-attrs') || '[]').filter((a) => a.key && a.key !== 'src');
      P().imageDialog({
        initial: { src: img.getAttribute('src'), attrs },
        onInsert: (src, newAttrs) => {
          img.setAttribute('src', src);
          img.setAttribute('data-dv-attrs', JSON.stringify([{ key: 'src', value: src }, ...newAttrs]));
          M.styleImage(img, newAttrs);
          sync();
        },
        onRemove: () => { img.remove(); sync(); },
      });
    }

    function ask(question, def) {
      const v = prompt(question, def || '');
      return v === null ? null : v.trim();
    }
    function askHttps(question) {
      const v = ask(question, 'https://');
      if (!v || v === 'https://') return null;
      if (!/^https:\/\//i.test(v)) { alert(t('Adressen måste börja med https://', 'The address must start with https://')); return null; }
      return v.replace(/\s/g, '');
    }

    const actions = {
      bold: () => exec('bold'),
      italic: () => exec('italic'),
      underline: () => exec('underline'),
      size: (n) => exec('fontSize', n),
      color: (c) => exec('foreColor', c),
      center: () => wrapSelection('<center>', '</center>'),
      quote: () => wrapSelection('<blockquote>', '</blockquote>'),
      box: () => wrapSelection('<box padding=10 border=1 bordercolor=#999999>', '</box>'),
      hr: () => insertMarkup('<hr>'),
      link: () => {
        const url = askHttps(t('Länkadress (https://…)', 'Link address (https://…)'));
        if (!url) return;
        const r = selectionRange();
        if (r && !r.collapsed) exec('createLink', url);
        else insertMarkup('<a href=' + url + '>' + url.replace(/^https:\/\//, '') + '</a>');
      },
      unlink: () => exec('unlink'),
      image: () => {
        saveRange();
        if (!P()) {
          const url = askHttps(t('Bildadress (https://…)', 'Image address (https://…)'));
          if (url) insertMarkup('<img src=' + url + '>');
          return;
        }
        P().imageDialog({
          galleryUrl: opts.galleryUrl,
          onInsert: (src, attrs) => { restoreRange(); insertMarkup('<img src=' + src + attrStr(attrs) + '>'); },
        });
      },
      member: () => {
        saveRange();
        const selectedText = savedRange && !savedRange.collapsed ? savedRange.toString() : '';
        const done = (id, name) => {
          restoreRange();
          const r = selectionRange();
          if (r && !r.collapsed) wrapSelection('<m ' + id + '>', '</m>');
          else insertMarkup('<m ' + id + '>' + esc(name || ('#' + id)) + '</m>');
        };
        if (!P()) {
          const id = ask(t('Medlemsnummer', 'Member number'));
          if (id && /^\d+$/.test(id)) done(id, '');
          return;
        }
        P().memberDialog({ friendsUrl: opts.friendsUrl, selectedText, onInsert: done });
      },
      spotify: () => {
        let v = ask(t('Spotify-länk eller URI (spotify:…)', 'Spotify link or URI (spotify:…)'));
        if (!v) return;
        const m = /open\.spotify\.com\/(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/.exec(v);
        if (m) v = 'spotify:' + m[1] + ':' + m[2];
        if (!/^spotify:/.test(v)) { alert(t('Det där ser inte ut som en Spotify-länk.', "That doesn't look like a Spotify link.")); return; }
        insertMarkup('\n<spotify ' + v + '>\n');
      },
      video: () => {
        const v = askHttps(t('YouTube- eller Vimeo-länk', 'YouTube or Vimeo link'));
        if (v) insertMarkup('\n<video ' + v + '>\n');
      },
      soundcloud: () => {
        const v = askHttps(t('SoundCloud-länk', 'SoundCloud link'));
        if (v) insertMarkup('\n<soundcloud ' + v + '>\n');
      },
      clear: () => exec('removeFormat'),
      source: () => toggleSource(),
    };

    // ------------------------------------------------------ toolbar
    const btn = (label, title, action, cls) => el('button', {
      type: 'button', class: 'dvw-btn' + (cls ? ' ' + cls : ''), title, 'aria-label': title, text: label,
      onmousedown: (e) => e.preventDefault(),  // keep the selection in the editor
      onclick: (e) => { e.preventDefault(); action(); },
    });
    const sizeSel = el('select', { class: 'dvw-select', title: t('Textstorlek', 'Text size') }, [
      el('option', { value: '', text: t('Storlek', 'Size') }),
      ...[1, 2, 3, 4, 5, 6].map((n) => el('option', { value: String(n), text: String(n) })),
    ]);
    sizeSel.addEventListener('change', () => { if (sizeSel.value) actions.size(sizeSel.value); sizeSel.value = ''; });
    const swatches = el('span', { class: 'dvw-swatches' }, COLORS.map((c) => {
      const b = btn('', t('Färg ', 'Colour ') + c, () => actions.color(c), 'dvw-swatch');
      b.style.background = c;
      return b;
    }));
    const picker = el('input', { type: 'color', class: 'dvw-picker', title: t('Valfri färg', 'Any colour'), value: '#c62828' });
    picker.addEventListener('change', () => actions.color(picker.value));

    const sourceBtn = btn(t('Källkod', 'Source'), t('Visa/redigera koden', 'Show/edit the markup'), actions.source, 'dvw-source');
    const sec = (node) => { node.classList.add('dvw-secondary'); return node; };
    const moreBtn = btn('⋯', t('Fler verktyg', 'More tools'), () => {
      const open = wrapper.classList.toggle('dvw-more-open');
      moreBtn.setAttribute('aria-expanded', String(open));
    }, 'dvw-more');
    moreBtn.setAttribute('aria-expanded', 'false');
    // Primary tools are always visible; secondary ones fold into "⋯" when the editor is narrow (phones).
    const toolbar = el('div', { class: 'dvw-toolbar', role: 'toolbar' }, [
      btn('B', t('Fet', 'Bold') + ' (Ctrl+B)', actions.bold, 'dvw-b'),
      btn('I', t('Kursiv', 'Italic') + ' (Ctrl+I)', actions.italic, 'dvw-i'),
      btn('U', t('Understruken', 'Underline') + ' (Ctrl+U)', actions.underline, 'dvw-u'),
      sizeSel, sec(swatches), picker,
      btn(t('Bild', 'Image'), t('Infoga bild från ditt galleri eller en adress (klicka på en bild för att ändra den)', 'Insert an image from your gallery or an address (click an image to edit it)'), actions.image, 'dvw-image'),
      btn('@', t('Länk till medlem (från din vänlista)', 'Link to member (from your friends list)'), actions.member, 'dvw-member-btn'),
      btn(t('Länk', 'Link'), t('Länk', 'Link'), actions.link, 'dvw-link'),
      sec(el('span', { class: 'dvw-sep' })),
      sec(btn(t('Centrera', 'Center'), t('Centrera', 'Center'), actions.center, 'dvw-center')),
      sec(btn('❝', t('Citat', 'Quote'), actions.quote, 'dvw-quote')),
      sec(btn(t('Ruta', 'Box'), t('Ruta runt texten', 'Box around the text'), actions.box)),
      sec(btn('—', t('Avgränsarlinje', 'Divider line'), actions.hr)),
      sec(btn(t('Ta bort länk', 'Unlink'), t('Ta bort länk', 'Remove link'), actions.unlink)),
      sec(btn('Spotify', t('Infoga Spotify-spelare', 'Insert Spotify player'), actions.spotify)),
      sec(btn(t('Video', 'Video'), t('Infoga YouTube/Vimeo', 'Insert YouTube/Vimeo'), actions.video)),
      sec(btn('SoundCloud', t('Infoga SoundCloud', 'Insert SoundCloud'), actions.soundcloud)),
      sec(btn('⌫', t('Rensa formatering', 'Clear formatting'), actions.clear)),
      moreBtn,
      sourceBtn,
    ]);

    // -------------------------------------------------------- source
    function toggleSource() {
      sourceMode = !sourceMode;
      if (sourceMode) {
        sync();
        area.style.display = 'none';
        textarea.style.display = '';
        textarea.focus();
      } else {
        load(textarea.value);
        textarea.style.display = 'none';
        area.style.display = '';
        focus();
      }
      wrapper.classList.toggle('dvw-in-source', sourceMode);
      sourceBtn.setAttribute('aria-pressed', String(sourceMode));
      toolbar.querySelectorAll('button:not(.dvw-source):not(.dvw-more), select, input').forEach((b) => { b.disabled = sourceMode; });
    }

    // ------------------------------------------------ keyboard / paste
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        // Diversia text is line based: Enter means a line break, not a new <div>
        e.preventDefault();
        document.execCommand('insertLineBreak');
        sync();
      }
    });
    area.addEventListener('click', (e) => {
      if (e.target && e.target.tagName === 'IMG' && area.contains(e.target)) { e.preventDefault(); editImage(e.target); }
    });
    area.addEventListener('paste', (e) => {
      const dt = e.clipboardData;
      if (!dt) return;
      e.preventDefault();
      const html = dt.getData('text/html');
      const text = dt.getData('text/plain');
      let markup;
      if (text && M.looksLikeMarkup(text) && !html) markup = text;           // pasted Diversia code
      else if (text && M.looksLikeMarkup(text) && !/<(p|div|span|h\d)[\s>]/i.test(html)) markup = text;
      else if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        markup = M.serialize(doc.body);
      } else markup = (text || '').replace(/</g, '&lt;');
      insertMarkup(markup);
    });
    area.addEventListener('input', sync);
    area.addEventListener('blur', sync);

    // ---------------------------------------------------- mount
    wrapper.appendChild(toolbar);
    wrapper.appendChild(area);
    textarea.parentNode.insertBefore(wrapper, textarea);
    const prevDisplay = textarea.style.display;
    textarea.style.display = 'none';
    wrapper.appendChild(textarea.parentNode.removeChild(textarea));  // keep textarea (and its form) intact
    load(textarea.value);

    const api = {
      area, toolbar, textarea,
      getMarkup: () => { sync(); return textarea.value; },
      setMarkup: (m) => { textarea.value = m; load(m); sync(); },
      detach() {
        sync();
        observer.disconnect();
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('selectionchange', onSelChange);
        textarea.style.display = prevDisplay;
        wrapper.parentNode.insertBefore(textarea, wrapper);
        wrapper.remove();
        ATTACHED.delete(textarea);
      },
    };
    ATTACHED.set(textarea, api);
    return api;
  }

  root.DiversiaEditor = { attach, get: (ta) => ATTACHED.get(ta) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
