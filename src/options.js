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
    checkNow: 'Sök nu',
    checking: 'Söker…',
    upToDate: 'Du har den senaste versionen.',
    checkFailed: 'Kunde inte nå GitHub just nu. Försöker igen om en timme.',
  } : {
    title: 'Diversia WYSIWYG',
    updateCheck: 'Look for new versions',
    updateCheckHint: 'Asks GitHub once a day what the latest version is. '
      + "It is the extension's only request to anything other than the page you are on, "
      + 'and sends nothing about you or your text.',
    updateAvailable: 'Version {v} is available.',
    updateLink: 'Go to Releases',
    installed: 'Installed version: {v}.',
    checkNow: 'Check now',
    checking: 'Checking…',
    upToDate: 'You have the latest version.',
    checkFailed: "Couldn't reach GitHub just now. Trying again within the hour.",
  };

  const current = ext.runtime.getManifest().version;

  $('title').textContent = S.title;
  $('updateCheckLabel').textContent = S.updateCheck;
  $('updateCheckHint').textContent = S.updateCheckHint;
  $('installed').textContent = S.installed.replace('{v}', current);
  $('updatelink').textContent = S.updateLink;
  $('updatelink').href = V.RELEASES_URL;
  $('checkNow').textContent = S.checkNow;

  function renderUpdate(latest) {
    const show = !!latest && V.isNewer(latest, current);
    $('update').hidden = !show;
    if (show) $('updatetext').textContent = S.updateAvailable.replace('{v}', String(latest).replace(/^v/i, '')) + ' ';
  }

  // Ask the background script rather than fetching here: it owns the cache and
  // the once-a-day rule, so opening this panel repeatedly costs nothing.
  // `force` is the button, which skips the waiting period.
  function refresh(force) {
    let pending;
    try { pending = ext.runtime.sendMessage({ type: V.MESSAGE, force: !!force }); } catch (e) { return Promise.resolve(null); }
    if (!pending || typeof pending.then !== 'function') return Promise.resolve(null);
    return pending.then((info) => { renderUpdate(info && info.latest); return info; }, () => null);
  }

  $('checkNow').addEventListener('click', async () => {
    $('checkNow').disabled = true;
    $('checkStatus').textContent = S.checking;
    const info = await refresh(true);
    $('checkNow').disabled = false;
    if (!info) $('checkStatus').textContent = S.checkFailed;
    else if (!info.ok) $('checkStatus').textContent = S.checkFailed;
    else if (info.newer) $('checkStatus').textContent = '';
    else $('checkStatus').textContent = S.upToDate;
  });

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
