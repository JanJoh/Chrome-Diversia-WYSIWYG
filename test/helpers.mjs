// Shared Playwright launcher. Uses the `playwright` package (npm i -D playwright)
// and, if set, CHROMIUM_PATH to point at an existing Chromium binary.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch (e) { /* fall through */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

export const playwright = loadPlaywright();

export function chromiumOptions(extra = {}) {
  const opts = { ...extra };
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  return opts;
}

// Chromium follows the host platform's editing conventions, so the tests have
// to as well: on macOS it is Cmd+I for italic and Cmd+Down to reach the end of
// a contenteditable, not Ctrl+I and Ctrl+End.
const mac = process.platform === 'darwin';
export const KEYS = {
  toEnd: mac ? 'Meta+ArrowDown' : 'Control+End',
  italic: mac ? 'Meta+i' : 'Control+i',
};

export function launchBrowser() {
  return playwright.chromium.launch(chromiumOptions());
}
