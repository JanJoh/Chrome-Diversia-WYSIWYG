// Clicking the toolbar icon on a page outside the built-in list injects the
// editor there (only for that tab, thanks to activeTab).
// Works in Chrome, Firefox and Safari: `browser` where it exists, else `chrome`.
const ext = globalThis.browser || globalThis.chrome;

ext.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await ext.scripting.insertCSS({ target: { tabId: tab.id, allFrames: true }, files: ['src/editor.css'] });
    await ext.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/diversia.js', 'src/editor.js', 'src/pickers.js', 'src/content.js'],
    });
  } catch (e) {
    console.warn('Diversia WYSIWYG: cannot run on this page', e);
  }
});

// ---- version check --------------------------------------------------------
//
// The content script asks on load; the answer is cached for a day, so opening
// twenty Diversia tabs is still at most one request. The fetch happens here
// rather than in the content script so it isn't subject to the page's content
// security policy, and so the page never sees it.

importScriptsOrRequire();

function importScriptsOrRequire() {
  // Chrome and Safari run this as a service worker (importScripts available);
  // Firefox runs it as an event page, where the manifest loads version.js for us.
  if (typeof globalThis.DiversiaVersion === 'undefined' && typeof importScripts === 'function') {
    importScripts('/src/version.js');
  }
}

const V = globalThis.DiversiaVersion;

async function cached() {
  try {
    const r = await ext.storage.local.get([V.CACHE_KEY, V.SETTING_KEY]);
    return {
      cache: (r && r[V.CACHE_KEY]) || {},
      enabled: !(r && r[V.SETTING_KEY] === false),  // default on
    };
  } catch (e) {
    return { cache: {}, enabled: false };
  }
}

// Resolves to { ok, latest }. Never throws: a version check is not worth
// interrupting anything for. `force` skips the waiting period, for the button
// in the options page.
async function latestTag(force) {
  const { cache, enabled } = await cached();
  if (!enabled) return { ok: true, latest: null };
  // A check that failed is retried in an hour; one that succeeded, tomorrow.
  const waitFor = cache.failed ? V.RETRY_AFTER_MS : V.CHECK_AFTER_MS;
  if (!force && Date.now() - (cache.t || 0) < waitFor) return { ok: !cache.failed, latest: cache.latest || null };
  try {
    const res = await fetch(V.RELEASE_API, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tag = (await res.json()).tag_name;
    if (!tag) throw new Error('no tag_name in response');
    await ext.storage.local.set({ [V.CACHE_KEY]: { t: Date.now(), latest: tag } });
    return { ok: true, latest: tag };
  } catch (e) {
    // Keep the old answer, but mark the attempt as failed so it is tried again
    // within the hour rather than tomorrow.
    console.warn('Diversia WYSIWYG: version check failed', e);
    try { await ext.storage.local.set({ [V.CACHE_KEY]: { ...cache, t: Date.now(), failed: true } }); } catch (e2) { /* ignore */ }
    return { ok: false, latest: cache.latest || null };
  }
}

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== V.MESSAGE) return false;
  latestTag(msg.force).then(({ ok, latest }) => {
    const current = ext.runtime.getManifest().version;
    sendResponse({
      ok,
      current,
      latest: latest ? String(latest).replace(/^v/i, '') : null,
      newer: !!latest && V.isNewer(latest, current),
      url: V.RELEASES_URL,
    });
  });
  return true;  // answering asynchronously
});
