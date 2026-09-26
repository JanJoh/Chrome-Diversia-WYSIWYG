/*
 * Options page: the on/off switch for the version check, and whatever it last
 * found. Everything else about the extension is controlled from the page
 * itself, so this panel stays deliberately small.
 */
(function () {
  'use strict';

  const ext = globalThis.browser || globalThis.chrome;
  const V = globalThis.DiversiaVersion;
  const $ = (id) => document.getElementById(id);

  const sv = (navigator.language || 'sv').startsWith('sv');
  const S = sv ? {
    title: 'Diversia WYSIWYG',
    updateCheck: 'Sök efter nya versioner',
    updateCheckHint: 'Frågar GitHub en gång per dygn vilken den senaste versionen är. '
      + 'Det är tilläggets enda anrop till något annat än sidan du är på; inget om dig eller din text skickas med.',
    updateAvailable: 'Version {v} finns att hämta.',
    updateLink: 'Till Releases',
    installed: 'Installerad version: {v}.',
  } : {
    title: 'Diversia WYSIWYG',
    updateCheck: 'Look for new versions',
    updateCheckHint: 'Asks GitHub once a day what the latest version is. '
      + "It is the extension's only request to anything other than the page you are on, "
      + 'and sends nothing about you or your text.',
    updateAvailable: 'Version {v} is available.',
    updateLink: 'Go to Releases',
    installed: 'Installed version: {v}.',
  };

  const current = ext.runtime.getManifest().version;

  $('title').textContent = S.title;
  $('updateCheckLabel').textContent = S.updateCheck;
  $('updateCheckHint').textContent = S.updateCheckHint;
  $('installed').textContent = S.installed.replace('{v}', current);
  $('updatelink').textContent = S.updateLink;
  $('updatelink').href = V.RELEASES_URL;

  function renderUpdate(latest) {
    const show = !!latest && V.isNewer(latest, current);
    $('update').hidden = !show;
    if (show) $('updatetext').textContent = S.updateAvailable.replace('{v}', String(latest).replace(/^v/i, '')) + ' ';
  }

  // Ask the background script rather than fetching here: it owns the cache and
  // the once-a-day rule, so opening this panel repeatedly costs nothing.
  function refresh() {
    let pending;
    try { pending = ext.runtime.sendMessage({ type: V.MESSAGE }); } catch (e) { return; }
    if (!pending || typeof pending.then !== 'function') return;
    pending.then((info) => renderUpdate(info && info.latest), () => {});
  }

  ext.storage.local.get(V.SETTING_KEY).then((r) => {
    const on = !(r && r[V.SETTING_KEY] === false);  // default on
    $('updateCheck').checked = on;
    if (on) refresh();
  }, () => { $('updateCheck').checked = true; refresh(); });

  // Switching the check off takes down any notice it put up; switching it on
  // asks straight away instead of waiting for the next page load.
  $('updateCheck').addEventListener('change', () => {
    const on = $('updateCheck').checked;
    ext.storage.local.set({ [V.SETTING_KEY]: on }).catch(() => {});
    if (on) refresh();
    else renderUpdate(null);
  });
})();
