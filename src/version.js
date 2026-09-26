/*
 * Version check: once a day, ask GitHub for the latest release tag and compare
 * it with this build's version.
 *
 * This is the extension's only request to anything other than the page you are
 * on: no cookies (`credentials: 'omit'`), no headers of our own, nothing about
 * you or your text. It can be switched off completely in the extension's
 * options, and the answer is cached so a closed laptop isn't asked again.
 *
 * Shared by the background script (which does the fetching) and the options
 * page (which shows the result), so the comparison rules live in one place.
 */
(function (root) {
  'use strict';

  const REPO = 'JanJoh/Chrome-Diversia-WYSIWYG';

  // "v0.4.0" -> [0, 4, 0]. Extension versions are 1-4 dot-separated integers.
  function parseVersion(v) {
    return String(v).trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  }

  // Is `a` a later version than `b`? Equal or older both give false.
  function isNewer(a, b) {
    const x = parseVersion(a);
    const y = parseVersion(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  }

  root.DiversiaVersion = {
    REPO,
    RELEASE_API: `https://api.github.com/repos/${REPO}/releases/latest`,
    RELEASES_URL: `https://github.com/${REPO}/releases`,
    CHECK_AFTER_MS: 24 * 60 * 60 * 1000,
    CACHE_KEY: 'dvw-versioncheck',   // { t, latest } in storage.local
    SETTING_KEY: 'dvw-updatecheck',  // boolean in storage.local, default on
    MESSAGE: 'dvw-update',
    parseVersion,
    isNewer,
  };
})(globalThis);
