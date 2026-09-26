/*
 * Diversia markup <-> editor DOM.
 *
 * Diversia (formerly Darkside) uses a small HTML-like tag language:
 *   <font size= color= lineheight=>  <b> <i> <u>  <hr size= color= width=>  <br>
 *   <p align=>  <pre>  <center>  <a href=>  <blockquote>  <img src= ...>
 *   <box align= bgcolor= padding= border= bordercolor=>
 *   site-specific: <m 12345>…</m>  <alster 123>…</alster>
 *                  <video URL>  <soundcloud URL>  <spotify URI>
 * Attribute values are unquoted. Unknown tags are shown as plain text by the
 * site. A literal "<" is written as &lt;. Line breaks in the text are kept.
 *
 * parse(markup, doc)  -> DocumentFragment for a contenteditable editor
 * serialize(node)     -> Diversia markup (whitelist; always correctly nested)
 */
(function (root) {
  'use strict';
  if (root.DiversiaMarkup && typeof module === 'undefined') return;  // already loaded

  const KNOWN = new Set(['font', 'img', 'box', 'b', 'i', 'u', 'hr', 'br', 'p', 'pre', 'center',
    'a', 'm', 'alster', 'blockquote', 'video', 'soundcloud', 'spotify']);
  const VOID = new Set(['img', 'hr', 'br', 'video', 'soundcloud', 'spotify']);
  const EMBEDS = new Set(['video', 'soundcloud', 'spotify']);
  const EMBED_LABEL = { video: 'Video', soundcloud: 'SoundCloud', spotify: 'Spotify' };

  // ---------------------------------------------------------------- tokenizer

  function parseAttrs(str) {
    const attrs = [];            // [{key, value}] keeps original order; key null = positional
    const re = /\s*("[^"]*"|'[^']*'|[^\s"']+)/g;
    let m;
    while ((m = re.exec(str))) {
      let tok = m[1];
      const kv = /^([a-zA-Z_][\w-]*)=(.*)$/.exec(tok);
      if (kv) {
        let v = kv[2];
        if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
        attrs.push({ key: kv[1].toLowerCase(), value: v });
      } else {
        if (/^(["']).*\1$/.test(tok)) tok = tok.slice(1, -1);
        attrs.push({ key: null, value: tok });
      }
    }
    return attrs;
  }

  function tokenize(src) {
    const tokens = [];
    const re = /<(\/?)([a-zA-Z]+)(\s[^<>]*)?>/y;
    let text = '';
    let i = 0;
    const flush = () => { if (text) { tokens.push({ type: 'text', value: text }); text = ''; } };
    while (i < src.length) {
      if (src[i] === '<') {
        re.lastIndex = i;
        const m = re.exec(src);
        if (m && KNOWN.has(m[2].toLowerCase())) {
          flush();
          tokens.push({
            type: m[1] ? 'close' : 'open',
            name: m[2].toLowerCase(),
            attrs: m[1] ? [] : parseAttrs(m[3] || ''),
          });
          i = re.lastIndex;
          continue;
        }
      }
      if (src.startsWith('&lt;', i)) { text += '<'; i += 4; continue; }
      text += src[i];
      i++;
    }
    flush();
    return tokens;
  }

  // ------------------------------------------------------------------- tree

  function buildTree(tokens) {
    const rootNode = { name: '#root', attrs: [], children: [] };
    const stack = [rootNode];
    const top = () => stack[stack.length - 1];
    for (const t of tokens) {
      if (t.type === 'text') { top().children.push({ name: '#text', value: t.value }); continue; }
      if (t.type === 'open') {
        const node = { name: t.name, attrs: t.attrs, children: [] };
        if (t.name === 'p') {
          // a new <p> implicitly ends an open one
          const idx = stack.map((n) => n.name).lastIndexOf('p');
          if (idx > 0) stack.length = idx;
        }
        top().children.push(node);
        if (!VOID.has(t.name)) stack.push(node);
        continue;
      }
      // close: pop to the matching open tag, ignore stray closers
      const idx = stack.map((n) => n.name).lastIndexOf(t.name);
      if (idx > 0) stack.length = idx;
    }
    return rootNode;
  }

  // ------------------------------------------------------------ tree -> DOM

  const get = (attrs, key) => { const a = attrs.find((x) => x.key === key); return a ? a.value : undefined; };
  const positional = (attrs) => { const a = attrs.find((x) => x.key === null); return a ? a.value : ''; };
  const settings = { allowInsecureLocal: false };   // demo/tests only: accept http://localhost images and links
  const isHttps = (u) => /^https:\/\//i.test(u || '') ||
    (settings.allowInsecureLocal && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u || ''));

  // Preview of Diversia's <img> attributes inside the editor.
  function styleImage(el, attrs) {
    const w = get(attrs, 'width'); const h = get(attrs, 'height');
    const al = (get(attrs, 'align') || '').toLowerCase(); const b = get(attrs, 'border');
    const dim = (v) => (/^\d+%$/.test(v) ? v : /^\d+$/.test(v) ? v + 'px' : '');
    el.style.cssText = 'max-width:100%;height:auto';
    if (dim(w)) el.style.width = dim(w);
    if (dim(h)) { el.style.height = dim(h); }
    if (b && +b > 0) el.style.border = (+b) + 'px solid currentColor';
    if (al === 'left') { el.style.float = 'left'; el.style.margin = '0 10px 6px 0'; }
    else if (al === 'right') { el.style.float = 'right'; el.style.margin = '0 0 6px 10px'; }
    else if (al === 'center') { el.style.display = 'block'; el.style.margin = '6px auto'; }
  }
  const COLOR = /^#[0-9a-fA-F]{6}$/;

  function keepAttrs(el, attrs) {
    el.setAttribute('data-dv-attrs', JSON.stringify(attrs));
  }

  function toDom(node, doc, parent) {
    for (const c of node.children) {
      if (c.name === '#text') {
        const parts = c.value.split('\n');
        parts.forEach((p, k) => {
          if (k > 0) parent.appendChild(doc.createElement('br'));
          if (p) parent.appendChild(doc.createTextNode(p));
        });
        continue;
      }
      let el;
      const a = c.attrs;
      switch (c.name) {
        case 'b': case 'i': case 'u': case 'blockquote': case 'pre': case 'hr': case 'br':
          el = doc.createElement(c.name);
          break;
        case 'font': {
          el = doc.createElement('font');
          const size = get(a, 'size'); const color = get(a, 'color');
          if (size) el.setAttribute('size', size);
          if (color && COLOR.test(color)) el.setAttribute('color', color);
          const lh = get(a, 'lineheight');
          if (lh) el.style.lineHeight = parseInt(lh, 10) + 'px';
          break;
        }
        case 'center':
          el = doc.createElement('div');
          el.setAttribute('data-dv', 'center');
          el.style.textAlign = 'center';
          break;
        case 'p': {
          el = doc.createElement('div');
          el.setAttribute('data-dv', 'p');
          const al = get(a, 'align');
          if (al) el.style.textAlign = al;
          break;
        }
        case 'box': {
          el = doc.createElement('div');
          el.setAttribute('data-dv', 'box');
          const al = get(a, 'align'); const bg = get(a, 'bgcolor'); const pad = get(a, 'padding');
          const bw = get(a, 'border'); const bc = get(a, 'bordercolor');
          if (al) el.style.textAlign = al;
          if (bg && COLOR.test(bg)) el.style.backgroundColor = bg;
          el.style.padding = (parseInt(pad, 10) || 0) + 'px';
          if (bw) el.style.border = (parseInt(bw, 10) || 0) + 'px solid ' + (bc && COLOR.test(bc) ? bc : 'currentColor');
          break;
        }
        case 'a': {
          const href = get(a, 'href');
          el = doc.createElement(isHttps(href) ? 'a' : 'span');
          if (isHttps(href)) el.setAttribute('href', href);
          break;
        }
        case 'm': case 'alster':
          el = doc.createElement('a');
          el.setAttribute('data-dv', c.name);
          el.setAttribute('data-id', positional(a));
          el.className = 'dvw-ref';
          el.title = (c.name === 'm' ? 'Member ' : 'Library item ') + positional(a);
          break;
        case 'img': {
          const src = get(a, 'src');
          if (!isHttps(src)) continue;
          el = doc.createElement('img');
          el.setAttribute('src', src);
          styleImage(el, a);
          break;
        }
        case 'video': case 'soundcloud': case 'spotify':
          el = doc.createElement('span');
          el.className = 'dvw-embed';
          el.setAttribute('contenteditable', 'false');
          el.setAttribute('data-dv', c.name);
          el.textContent = EMBED_LABEL[c.name] + ': ' + positional(a);
          break;
        default:
          continue;
      }
      keepAttrs(el, a);
      if (!VOID.has(c.name)) toDom(c, doc, el);
      parent.appendChild(el);
    }
    return parent;
  }

  function parse(markup, doc) {
    doc = doc || root.document;
    const frag = doc.createDocumentFragment();
    return toDom(buildTree(tokenize(String(markup || '').replace(/\r\n?/g, '\n'))), doc, frag);
  }

  // ------------------------------------------------------ DOM -> markup

  function attrString(pairs) {
    return pairs.filter((p) => p.value !== undefined && p.value !== null && p.value !== '')
      .map((p) => (p.key ? ' ' + p.key + '=' + p.value : ' ' + p.value)).join('');
  }

  function storedAttrs(el) {
    try { return JSON.parse(el.getAttribute('data-dv-attrs') || '[]'); } catch (e) { return []; }
  }

  function toHexColor(c) {
    if (!c) return '';
    c = String(c).trim();
    if (COLOR.test(c)) return c.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
    if (m) return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
    return '';
  }

  const PX_TO_SIZE = [[10, 1], [13, 2], [16, 3], [18, 4], [24, 5], [Infinity, 6]];
  function cssSizeToFont(fs) {
    if (!fs) return '';
    const named = { 'x-small': 1, small: 2, medium: 3, large: 4, 'x-large': 5, 'xx-large': 6, 'xxx-large': 6 };
    if (named[fs]) return String(named[fs]);
    const px = /([\d.]+)px/.exec(fs);
    if (px) { for (const [lim, s] of PX_TO_SIZE) if (+px[1] <= lim) return String(s); }
    const em = /([\d.]+)(em|rem)/.exec(fs);
    if (em) return cssSizeToFont((+em[1] * 16) + 'px');
    return '';
  }

  const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'TABLE', 'TR',
    'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'ADDRESS']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'HEAD', 'TITLE', 'META', 'LINK', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

  function serialize(node) {
    let out = '';
    const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const wrap = (open, close, fn) => {
      const start = out.length;
      out += open;
      const inner = out.length;
      fn();
      if (out.length === inner) { out = out.slice(0, start); return; } // drop empty wrappers
      out += close;
    };

    function children(el) { for (const c of el.childNodes) walk(c); }

    function walk(n) {
      if (n.nodeType === 3) {
        out += n.nodeValue.replace(/​/g, '').replace(/ /g, ' ').replace(/</g, '&lt;');
        return;
      }
      if (n.nodeType !== 1 && n.nodeType !== 11) return;
      if (n.nodeType === 11) { children(n); return; }
      const tag = n.tagName;
      if (SKIP.has(tag)) return;
      const dv = n.getAttribute('data-dv');
      const st = n.style || {};
      const attrs = storedAttrs(n);
      const fromParser = n.hasAttribute('data-dv-attrs');
      const blockNl = () => { if (!fromParser) nl(); };

      if (tag === 'BR') {
        // Chrome places a trailing <br> in otherwise empty blocks; that one is only a placeholder
        const p = n.parentNode;
        if (p && p !== node && BLOCK_TAGS.has(p.tagName) && !p.hasAttribute('data-dv-attrs') &&
            p.lastChild === n && p.childNodes.length > 1) return;
        out += '\n';
        return;
      }
      if (tag === 'HR') {
        const keep = attrs.filter((a) => ['size', 'color', 'width'].includes(a.key));
        out += '<hr' + attrString(keep) + '>';
        return;
      }
      if (tag === 'IMG') {
        const src = n.getAttribute('src');
        if (!isHttps(src)) return;
        const keep = attrs.filter((a) => ['border', 'width', 'height', 'align'].includes(a.key));
        const w = n.getAttribute('width'); const h = n.getAttribute('height');
        if (w && !keep.some((a) => a.key === 'width')) keep.push({ key: 'width', value: w });
        if (h && !keep.some((a) => a.key === 'height')) keep.push({ key: 'height', value: h });
        out += '<img src=' + src + attrString(keep) + '>';
        return;
      }
      if (dv && EMBEDS.has(dv)) {
        const arg = attrs.find((a) => a.key === null);
        const rest = attrs.filter((a) => a.key === 'width' || a.key === 'height');
        out += '<' + dv + (arg ? ' ' + arg.value : '') + attrString(rest) + '>';
        return;
      }

      // inline styling coming from paste / styleWithCSS
      const bold = tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(st.fontWeight || '');
      const italic = tag === 'I' || tag === 'EM' || st.fontStyle === 'italic';
      const under = tag === 'U' || tag === 'INS' || /underline/.test(st.textDecoration || st.textDecorationLine || '');

      if (dv === 'm' || dv === 'alster') {
        const id = (n.getAttribute('data-id') || '').replace(/[^\w-]/g, '');
        if (!id) { children(n); return; }
        wrap('<' + dv + ' ' + id + '>', '</' + dv + '>', () => children(n));
        return;
      }
      if (tag === 'A') {
        const href = n.getAttribute('href');
        if (isHttps(href)) wrap('<a href=' + href + '>', '</a>', () => children(n));
        else children(n);
        return;
      }
      if (tag === 'BLOCKQUOTE') { blockNl(); wrap('<blockquote>', '</blockquote>', () => children(n)); return; }
      if (tag === 'PRE') { blockNl(); wrap('<pre>', '</pre>', () => children(n)); return; }
      if (dv === 'box') {
        const keep = attrs.filter((a) => a.key);
        wrap('<box' + attrString(keep) + '>', '</box>', () => children(n));
        return;
      }
      if (dv === 'p') {
        const align = st.textAlign && st.textAlign !== 'start' ? st.textAlign : '';
        wrap('<p' + (align ? ' align=' + align : '') + '>', '</p>', () => children(n));
        return;
      }
      if (dv === 'center' || tag === 'CENTER') {
        blockNl(); wrap('<center>', '</center>', () => children(n)); return;
      }
      if (/^H[1-6]$/.test(tag)) {
        nl();
        const size = { H1: 6, H2: 5, H3: 4, H4: 4, H5: 3, H6: 3 }[tag];
        wrap('<font size=' + size + '><b>', '</b></font>', () => children(n));
        out += '\n';
        return;
      }
      if (tag === 'LI') {
        nl();
        const ol = n.parentNode && n.parentNode.tagName === 'OL';
        out += ol ? (Array.prototype.indexOf.call(n.parentNode.children, n) + 1) + '. ' : '• ';
        children(n);
        out += '\n';
        return;
      }

      const blockish = BLOCK_TAGS.has(tag);
      const align = blockish ? (st.textAlign || n.getAttribute('align') || '') : '';

      // font / colour
      let size = '', color = '', lineheight = '';
      if (tag === 'FONT') {
        size = n.getAttribute('size') || '';
        const rawColor = n.getAttribute('color') || '';
        color = fromParser && COLOR.test(rawColor) ? rawColor : toHexColor(rawColor);
        const lh = attrs.find((a) => a.key === 'lineheight');
        if (lh) lineheight = lh.value;
      }
      if (st.color && !(tag === 'FONT' && fromParser)) color = toHexColor(st.color) || color;
      if (st.fontSize) size = cssSizeToFont(st.fontSize) || size;
      if (size) size = String(Math.min(6, Math.max(1, parseInt(size, 10) || 3)));

      const opens = [], closes = [];
      if (size || color || lineheight) {
        const vals = { size, color, lineheight };
        const order = attrs.map((a) => a.key).filter((k) => k in vals);
        for (const k of ['size', 'color', 'lineheight']) if (!order.includes(k)) order.push(k);
        opens.push('<font' + attrString(order.map((k) => ({ key: k, value: vals[k] }))) + '>');
        closes.unshift('</font>');
      }
      if (bold) { opens.push('<b>'); closes.unshift('</b>'); }
      if (italic) { opens.push('<i>'); closes.unshift('</i>'); }
      if (under) { opens.push('<u>'); closes.unshift('</u>'); }

      const body = () => {
        if (opens.length) wrap(opens.join(''), closes.join(''), () => children(n));
        else children(n);
      };

      if (blockish) {
        nl();
        if (align === 'center') wrap('<center>', '</center>', body);
        else if (align === 'right' || align === 'justify') wrap('<p align=' + align + '>', '</p>', body);
        else body();
        nl();
      } else {
        body();
      }
    }

    if (node.nodeType === 1 || node.nodeType === 11 || node.nodeType === 9) children(node.nodeType === 9 ? node.body : node);
    else walk(node);
    return out.replace(/\n+$/, '');
  }

  const api = { parse, serialize, tokenize, buildTree, looksLikeMarkup, styleImage, isHttps, settings };

  function looksLikeMarkup(text) {
    return /<(\/?)(b|i|u|font|hr|br|p|box|center|blockquote|pre|a\s+href=|img\s+src=|m\s+\d|alster\s|video\s|soundcloud\s|spotify\s)[^<>]*>/i.test(text || '');
  }

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DiversiaMarkup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
