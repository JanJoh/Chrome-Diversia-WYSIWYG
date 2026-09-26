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

// Resolves to the newest release tag we know of, or null. Never throws: a
// version check is not worth interrupting anything for.
async function latestTag() {
  const { cache, enabled } = await cached();
  if (!enabled) return null;
  if (Date.now() - (cache.t || 0) < V.CHECK_AFTER_MS) return cache.latest || null;
  try {
    const res = await fetch(V.RELEASE_API, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tag = (await res.json()).tag_name;
    if (!tag) throw new Error('no tag_name in response');
    await ext.storage.local.set({ [V.CACHE_KEY]: { t: Date.now(), latest: tag } });
    return tag;
  } catch (e) {
    // A failed check isn't worth telling the user about, and isn't worth
    // retrying before tomorrow either: stamp the time, keep the old answer.
    console.warn('Diversia WYSIWYG: version check failed', e);
    try { await ext.storage.local.set({ [V.CACHE_KEY]: { ...cache, t: Date.now() } }); } catch (e2) { /* ignore */ }
    return cache.latest || null;
  }
}

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== V.MESSAGE) return false;
  latestTag().then((latest) => {
    const current = ext.runtime.getManifest().version;
    sendResponse(latest && V.isNewer(latest, current)
      ? { latest: String(latest).replace(/^v/i, ''), url: V.RELEASES_URL }
      : null);
  });
  return true;  // answering asynchronously
});
