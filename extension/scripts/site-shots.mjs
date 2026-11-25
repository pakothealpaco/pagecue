/**
 * Makes the user guide's screenshots of the real prompter, from the demo page (site/public/demo),
 * and records where each control is, so the guide can number them. Redo them whenever the prompter
 * changes:
 *
 *   PAGECUE_QA=1 npx wxt build && node scripts/site-shots.mjs
 *
 * Writes site/src/assets/shots/*.png and site/src/data/shots.json.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium } from './chromium.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const extensionPath = resolve(here, '../.output-qa/chrome-mv3');
const shots = join(root, 'site/src/assets/shots');
const data = join(root, 'site/src/data');

const PROMPTER = { width: 400, height: 640 };
const SITE = { width: 1000, height: 640 };
const SCALE = 3;

const PLAIN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pricing plan, draft 2</title>
<style>body{font:17px/1.6 system-ui,sans-serif;max-width:720px;margin:60px auto;padding:0 24px;color:#222}</style></head>
<body><h1>Pricing plan, draft 2</h1><p>A page with no cues yet.</p><h2>Tiers</h2><p>${'Text. '.repeat(200)}</p></body></html>`;

/** Box of an element relative to the prompter viewport, as shares of its size (0 to 1). */
async function box(page, selector, label) {
  const el = page.locator(selector).first();
  const b = await el.boundingBox();
  if (!b) throw new Error(`Not on screen: ${selector}`);
  const v = page.viewportSize();
  return {
    label,
    x: +(b.x / v.width).toFixed(4),
    y: +(b.y / v.height).toFixed(4),
    w: +(b.width / v.width).toFixed(4),
    h: +(b.height / v.height).toFixed(4),
  };
}

async function main() {
  if (!existsSync(join(extensionPath, 'manifest.json')))
    throw new Error('Build the QA variant first: PAGECUE_QA=1 npx wxt build');
  mkdirSync(shots, { recursive: true });
  mkdirSync(data, { recursive: true });

  const siteRoot = join(root, 'site/public');
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/plain/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PLAIN);
    let path = join(siteRoot, pathname);
    if (path.endsWith('/')) path = join(path, 'index.html');
    if (!path.startsWith(siteRoot) || !existsSync(path)) return res.writeHead(404).end();
    const type = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' }[extname(path)];
    res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' }).end(readFileSync(path));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  // Real-looking addresses in the shots: Chromium maps them to the local server.
  const port = server.address().port;
  const origin = 'http://reports.example.com';
  const demo = `${origin}/demo/`;

  const profile = mkdtempSync(join(tmpdir(), 'pagecue-shots-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChromium(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--host-resolver-rules=MAP reports.example.com:80 127.0.0.1:${port}`,
    ],
    viewport: SITE,
    deviceScaleFactor: SCALE,
  });
  const markers = {};
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const site = await context.newPage();
    await site.goto(demo);
    const plain = await context.newPage();
    await plain.goto(`${origin}/plain/`);
    const prompter = await context.newPage();
    await prompter.setViewportSize(PROMPTER);
    await prompter.goto(`chrome-extension://${extensionId}/prompter.html`);
    await prompter.evaluate(async () => {
      const key = 'prompter-settings';
      const stored = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({
        [key]: { ...stored, tipSeen: true, linesExplained: true, sectionLines: false },
      });
    });
    await prompter.reload();

    const target = (url) =>
      prompter.evaluate(async (u) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url === u);
        if (!tab) throw new Error(`No tab for ${u}: ${tabs.map((t) => t.url).join(', ')}`);
        await chrome.storage.session.set({ target: { tabId: tab.id, at: Date.now() } });
      }, url);
    const awake = async () => {
      await prompter.mouse.move(200, 300);
      await prompter.mouse.move(210, 320);
      await prompter.waitForTimeout(250);
    };
    // Every shot twice, once per theme, so the guide can show the one that matches the reader's.
    for (const theme of ['dark', 'light']) {
      const shoot = async (name, page = prompter, clip = undefined) => {
        writeFileSync(join(shots, `${name}-${theme}.png`), await page.screenshot({ clip }));
      };
      await site.emulateMedia({ colorScheme: theme });
      await plain.emulateMedia({ colorScheme: theme });
      await prompter.evaluate(async (t) => {
        const key = 'prompter-settings';
        const stored = (await chrome.storage.local.get(key))[key] ?? {};
        await chrome.storage.local.set({ [key]: { ...stored, theme: t } });
      }, theme);
      await prompter.reload();
      const first = theme === 'dark';

      // 1. The prompter following the demo, at its revenue chart.
      await site.bringToFront();
      await target(demo);
      await prompter.locator('.cue-list .cue-title').nth(5).waitFor();
      await site.evaluate(() => {
        const h = [...document.querySelectorAll('h2')].find((e) => e.textContent === 'Revenue by month');
        window.scrollTo({ top: h.getBoundingClientRect().top + scrollY - innerHeight * 0.3 + 6, behavior: 'instant' });
      });
      await prompter.waitForTimeout(1000);
      await awake();
      if (first)
        markers.prompter = [
          await box(prompter, '.light-button', 'Cue light'),
          await box(prompter, '.page-name', 'Page title'),
          await box(prompter, '.position', 'Position'),
          await box(prompter, '.cue.is-lit', 'Current cue'),
          await box(prompter, '.timer', 'Timer'),
          await box(prompter, '.lines-toggle', 'Lines'),
          await box(prompter, '.size-buttons', 'Text size'),
          await box(prompter, '.menu-button', 'More'),
        ];
      await shoot('prompter');

      // 2. The ··· menu.
      await prompter.locator('.menu-button').click();
      await prompter.waitForTimeout(300);
      await shoot('menu');
      await prompter.keyboard.press('Escape');

      // 3. Editing a cue.
      await prompter.locator('.cue.is-lit').dblclick();
      await prompter.locator('.cue.is-editing .cue-title.field').waitFor();
      await prompter.waitForTimeout(300);
      if (first)
        markers.editing = [
          await box(prompter, '.cue.is-editing .cue-title.field', 'Headline'),
          await box(prompter, '.cue.is-editing .cue-points.field', 'Points'),
          await box(prompter, '.cue.is-editing .danger', 'Delete'),
          await box(prompter, '.cue.is-editing .done-button', 'Done'),
        ];
      await shoot('editing');
      await prompter.keyboard.press('Escape');
      await prompter.waitForTimeout(200);

      // 4. Section lines on the shared page, beside the prompter.
      await prompter.keyboard.press('l');
      await prompter.waitForTimeout(900);
      await shoot('lines-page', site);
      await awake();
      await shoot('lines-prompter');
      await prompter.keyboard.press('l');
      await prompter.waitForTimeout(300);

      // 5. Sites.
      await prompter.keyboard.press('s');
      await prompter.locator('.sheet').waitFor();
      await prompter.waitForTimeout(300);
      await shoot('sites', prompter, { x: 0, y: 0, width: PROMPTER.width, height: 180 });
      await prompter.keyboard.press('Escape');

      // 6. A page with no cues yet.
      await plain.bringToFront();
      await target(`${origin}/plain/`);
      await prompter.locator('.empty').waitFor();
      await prompter.waitForTimeout(600);
      await awake();
      await shoot('empty');
    }

    writeFileSync(join(data, 'shots.json'), `${JSON.stringify(markers, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(markers).length} marker sets and the shots to site/src/assets/shots`);
  } finally {
    await context.close();
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
