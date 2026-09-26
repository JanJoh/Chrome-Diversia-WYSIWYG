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
