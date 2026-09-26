/*
 * Content script: adds a small "WYSIWYG" switch above every sizeable
 * textarea on the page. The choice is remembered per site.
 */
(function () {
  'use strict';
  if (window.__dvwLoaded) { window.__dvwScan && window.__dvwScan(true); return; }
  window.__dvwLoaded = true;

  const sv = (document.documentElement.lang || navigator.language || 'sv').startsWith('sv');
  const LABEL_ON = sv ? 'Visuell redigering: PÅ' : 'Visual editing: ON';
  const LABEL_OFF = sv ? 'Visuell redigering: AV' : 'Visual editing: OFF';
  const KEY = 'dvw-auto';

  const ext = globalThis.browser || globalThis.chrome;   // Firefox/Safari expose `browser`, Chrome `chrome`
  const storage = {
    get(cb) {
      try { ext.storage.local.get(KEY).then((r) => cb(!!(r && r[KEY])), () => cb(false)); } catch (e) { cb(false); }
    },
    set(v) { try { ext.storage.local.set({ [KEY]: v }).catch(() => {}); } catch (e) { /* not in extension context */ } },
  };

  function eligible(ta) {
    if (ta.dataset.dvwSwitch || ta.readOnly || ta.disabled) return false;
    if (ta.closest('.dvw-wrapper')) return false;
    const rows = parseInt(ta.getAttribute('rows') || '0', 10);
    return rows >= 4 || ta.offsetHeight >= 70 || ta.offsetWidth >= 300;
  }

  function addSwitch(ta, autoOn) {
    ta.dataset.dvwSwitch = '1';
    const bar = document.createElement('div');
    bar.className = 'dvw-switchbar';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dvw-switch';
    bar.appendChild(button);
    ta.parentNode.insertBefore(bar, ta);

    const render = () => {
      const on = !!DiversiaEditor.get(ta);
      button.textContent = on ? LABEL_ON : LABEL_OFF;
      button.setAttribute('aria-pressed', String(on));
    };
    button.addEventListener('click', () => {
      const ed = DiversiaEditor.get(ta);
      if (ed) { ed.detach(); storage.set(false); }
      else { DiversiaEditor.attach(ta); storage.set(true); }
      // keep the switch directly above whatever is visible now
      const target = DiversiaEditor.get(ta) ? ta.closest('.dvw-wrapper') : ta;
      target.parentNode.insertBefore(bar, target);
      render();
    });
    if (autoOn) {
      DiversiaEditor.attach(ta);
      const w = ta.closest('.dvw-wrapper');
      w.parentNode.insertBefore(bar, w);
    }
    render();
  }

  function scan(forceOn) {
    storage.get((auto) => {
      document.querySelectorAll('textarea').forEach((ta) => {
        if (eligible(ta)) addSwitch(ta, auto || forceOn);
      });
    });
  }
  window.__dvwScan = scan;

  scan(false);
  new MutationObserver(() => scan(false)).observe(document.documentElement, { childList: true, subtree: true });
})();
