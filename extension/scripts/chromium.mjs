/** Finds a Chromium to drive: $PAGECUE_CHROMIUM, Playwright's bundled one, or one in its cache. */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export function findChromium() {
  if (process.env.PAGECUE_CHROMIUM) return process.env.PAGECUE_CHROMIUM;
  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  const cache = join(
    homedir(),
    process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright',
  );
  for (const dir of readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse()) {
    const found = [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-linux64/chrome',
    ]
      .map((rel) => join(cache, dir, rel))
      .find(existsSync);
    if (found) return found;
  }
  throw new Error('No Chromium found.');
}
