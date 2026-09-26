// Version comparison: the rules that decide whether a notice is shown at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// version.js is a plain script that hangs DiversiaVersion off globalThis, so
// it loads the same way in a service worker, the options page and here.
const sandbox = vm.createContext({});
vm.runInContext(readFileSync('src/version.js', 'utf8'), sandbox);
const V = sandbox.DiversiaVersion;
// Arrays built inside the sandbox carry its Array.prototype, so copy them into
// this realm before a strict deep comparison.
const parse = (v) => Array.from(V.parseVersion(v));

test('a release tag is parsed with or without the leading v', () => {
  assert.deepEqual(parse('v0.4.0'), [0, 4, 0]);
  assert.deepEqual(parse('0.4.0'), [0, 4, 0]);
  assert.deepEqual(parse(' V1.2.3.4 '), [1, 2, 3, 4]);
  // Anything unparseable counts as 0 rather than NaN, so it never looks newer.
  assert.deepEqual(parse('v1.x'), [1, 0]);
});

test('only a genuinely later release counts as newer', () => {
  assert.ok(V.isNewer('v0.4.0', '0.3.0'));
  assert.ok(V.isNewer('v0.3.1', '0.3.0'));
  assert.ok(V.isNewer('v1.0.0', '0.9.9'));
  assert.ok(!V.isNewer('v0.3.0', '0.3.0'), 'same version');
  assert.ok(!V.isNewer('v0.2.9', '0.3.0'), 'older release');
});

test('differing lengths compare on the missing part as zero', () => {
  assert.ok(V.isNewer('v0.3.1', '0.3'));
  assert.ok(!V.isNewer('v0.3', '0.3.0'));
  assert.ok(!V.isNewer('v0.3.0', '0.3'));
});

test('the check points at this repository and is switchable', () => {
  assert.equal(V.REPO, 'JanJoh/Diversia-WYSIWYG');
  assert.ok(V.RELEASE_API.startsWith('https://api.github.com/repos/'));
  assert.ok(V.RELEASES_URL.endsWith('/releases'));
  assert.equal(V.CHECK_AFTER_MS, 24 * 60 * 60 * 1000);
  // a failed check must come back sooner than a successful one, or a check
  // made before the first release existed suppresses the notice for a day
  assert.equal(V.RETRY_AFTER_MS, 60 * 60 * 1000);
  assert.ok(V.RETRY_AFTER_MS < V.CHECK_AFTER_MS);
  assert.ok(V.SETTING_KEY && V.CACHE_KEY && V.MESSAGE);
});
