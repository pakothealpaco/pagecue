/**
 * Makes the Chrome Web Store images from the real extension on the demo report (site/public/demo):
 * five 1280x800 screenshots and the 440x280 promo tile, in docs/store/.
 *
 *   PAGECUE_QA=1 npx wxt build && node scripts/store-media.mjs
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
const out = join(root, 'docs/store');
const SITE = { width: 820, height: 536 };
const PROMPTER = { width: 330, height: 536 };

const PLAIN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pricing plan, draft 2</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 28px;color:#1d2430;background:#fff}
h1{font-size:32px;line-height:1.15;margin:0 0 8px;letter-spacing:-.01em}.lead{color:#5b6472;font-size:18px;margin:0 0 28px}
.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.tier{border:1px solid #e3e7ee;border-radius:12px;padding:16px}
.tier b{display:block;font-size:15px}.tier .price{font-size:26px;font-weight:700;margin:6px 0}.tier p{margin:0;color:#5b6472;font-size:14px}
.tier.pick{border-color:#3b6ef5;box-shadow:0 0 0 1px #3b6ef5}h2{font-size:20px;margin:32px 0 8px}p{color:#3d4552}</style></head>
<body><h1>Pricing plan, draft 2</h1><p class="lead">Three tiers, one decision for Thursday's board meeting.</p>
<div class="tiers"><div class="tier"><b>Starter</b><div class="price">$12</div><p>Per seat a month. Up to 5 seats.</p></div>
<div class="tier pick"><b>Team</b><div class="price">$29</div><p>Per seat a month. Most teams land here.</p></div>
<div class="tier"><b>Enterprise</b><div class="price">Talk to us</div><p>SSO, audit log, a named contact.</p></div></div>
<h2>Why we're moving off one price</h2><p>Small teams churn at the current $24 and large ones ask for features we can't give away. Splitting the price lets us charge for what each group values.</p>
<h2>What changes for current customers</h2><p>Nothing for twelve months: everyone keeps today's price until their next renewal after that.</p></body></html>`;

const MARK = readFileSync(join(root, 'site/src/assets/mark.svg'), 'utf8');

/** One store screenshot: a headline, then the shared page and the prompter side by side. */
const frame = (title, sub, page, prompter, dark = false) => `<!doctype html><html><head><style>
  @font-face { font-family: Plex; font-weight: 600; src: url(data:font/woff2;base64,${FONT600}); }
  @font-face { font-family: Plex; font-weight: 400; src: url(data:font/woff2;base64,${FONT400}); }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1280px; height: 800px; overflow: hidden; font-family: Plex, system-ui, sans-serif;
    background: ${dark ? '#0e1116' : '#f3f5f8'}; color: ${dark ? '#ece8e1' : '#151a22'}; }
  header { padding: 46px 64px 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; }
  h1 { margin: 0; font-size: 40px; line-height: 1.1; letter-spacing: -0.02em; font-weight: 600; }
  p { margin: 10px 0 0; font-size: 19px; color: ${dark ? '#a9afb8' : '#4a525e'}; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 20px; flex: none; }
  .brand svg { width: 30px; height: 30px; }
  .stage { position: absolute; left: 64px; right: 64px; bottom: 36px; height: 566px; display: flex; gap: 22px; align-items: flex-start; }
  .win { border-radius: 14px; overflow: hidden; background: #fff;
    box-shadow: 0 0 0 1px ${dark ? '#2a303a' : '#d9dee5'}, 0 20px 50px rgba(15, 20, 30, ${dark ? 0.5 : 0.14}); }
  .win img { display: block; }
  .label { font-size: 14px; margin: 0 0 8px 4px; color: ${dark ? '#8a919c' : '#5e6672'}; display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; }
</style></head><body>
  <header><div><h1>${title}</h1><p>${sub}</p></div><div class="brand">${MARK}pagecue</div></header>
  <div class="stage">
    <div><div class="label"><span class="dot" style="background:#d9573f"></span>The tab you share</div>
      <div class="win"><img src="data:image/png;base64,${page}" width="${SITE.width}" height="${SITE.height}"></div></div>
    <div><div class="label"><span class="dot" style="background:#3ccf7f"></span>Your prompter, not shared</div>
      <div class="win"><img src="data:image/png;base64,${prompter}" width="${PROMPTER.width}" height="${PROMPTER.height}"></div></div>
  </div>
</body></html>`;

let FONT400 = '';
let FONT600 = '';

async function main() {
  if (!existsSync(join(extensionPath, 'manifest.json')))
    throw new Error('Build the QA variant first: PAGECUE_QA=1 npx wxt build');
  mkdirSync(out, { recursive: true });
  const fonts = resolve(root, 'site/node_modules/@fontsource/ibm-plex-sans/files');
  FONT400 = readFileSync(join(fonts, 'ibm-plex-sans-latin-400-normal.woff2')).toString('base64');
  FONT600 = readFileSync(join(fonts, 'ibm-plex-sans-latin-600-normal.woff2')).toString('base64');

  const siteRoot = join(root, 'site/public');
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/plain/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PLAIN);
    let path = join(siteRoot, pathname);
    if (path.endsWith('/')) path = join(path, 'index.html');
    if (!path.startsWith(siteRoot) || !existsSync(path)) return res.writeHead(404).end();
    const type = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' }[extname(path)];
    res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' }).end(readFileSync(path));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  const origin = 'http://reports.example.com';
  const demo = `${origin}/demo/`;

  const profile = mkdtempSync(join(tmpdir(), 'pagecue-store-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChromium(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--host-resolver-rules=MAP reports.example.com:80 127.0.0.1:${port}`,
    ],
    viewport: SITE,
    deviceScaleFactor: 1,
  });
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
    const settings = (patch) =>
      prompter.evaluate(async (p) => {
        const key = 'prompter-settings';
        const stored = (await chrome.storage.local.get(key))[key] ?? {};
        await chrome.storage.local.set({ [key]: { ...stored, ...p } });
      }, patch);
    await settings({ tipSeen: true, linesExplained: true, sectionLines: false, theme: 'light' });
    await prompter.reload();

    const target = (url) =>
      prompter.evaluate(async (u) => {
        const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
        await chrome.storage.session.set({ target: { tabId: tab.id, at: Date.now() } });
      }, url);
    const awake = async () => {
      await prompter.mouse.move(160, 18);
      await prompter.mouse.move(170, 20);
      await prompter.waitForTimeout(250);
    };
    const scrollTo = async (heading) => {
      await site.evaluate((text) => {
        const h = [...document.querySelectorAll('h1, h2')].find((e) => e.textContent === text);
        window.scrollTo({ top: h.getBoundingClientRect().top + scrollY - innerHeight * 0.3 + 6, behavior: 'instant' });
      }, heading);
      await prompter.waitForTimeout(1000);
    };
    const b64 = async (page) => (await page.screenshot()).toString('base64');
    const composer = await context.newPage();
    await composer.setViewportSize({ width: 1280, height: 800 });
    const compose = async (name, title, sub, page, side, dark = false) => {
      await composer.setContent(frame(title, sub, page, side, dark));
      await composer.waitForTimeout(150);
      writeFileSync(join(out, `${name}.jpg`), await composer.screenshot({ type: 'jpeg', quality: 92 }));
    };

    await site.bringToFront();
    await target(demo);
    await prompter.locator('.cue-list .cue-title').nth(5).waitFor();

    // 1. The idea: the page you share, your cues beside it.
    await scrollTo('Revenue by month');
    await awake();
    await compose(
      '1-follows',
      'Speaker notes for any web page',
      'Your cues sit in a private window that follows the page as you scroll.',
      await b64(site),
      await b64(prompter),
    );

    // 2. Written with Claude: the empty page offers the skill's command.
    await plain.bringToFront();
    await target(`${origin}/plain/`);
    await prompter.locator('.empty').waitFor();
    await prompter.waitForTimeout(500);
    await awake();
    await compose(
      '2-claude',
      'Written with Claude',
      'Paste one command into Claude Code. The pagecue skill plans the cues and writes them with you.',
      await b64(plain),
      await b64(prompter),
    );

    // 3. Section lines: see and drag where each cue starts.
    await site.bringToFront();
    await target(demo);
    await prompter.locator('.cue-list .cue-title').nth(5).waitFor();
    await scrollTo('Where it sold');
    await prompter.keyboard.press('l');
    await prompter.waitForTimeout(900);
    await awake();
    await compose(
      '3-lines',
      'See where each cue starts',
      'Press L for section lines on the page. Drag one to adjust, then hide them before you present.',
      await b64(site),
      await b64(prompter),
    );
    await prompter.keyboard.press('l');
    await prompter.waitForTimeout(300);

    // 4. Your own words: edit a cue in place.
    await scrollTo('Two things to watch');
    await prompter.locator('.cue.is-lit').dblclick();
    await prompter.locator('.cue.is-editing .cue-title.field').waitFor();
    await prompter.waitForTimeout(300);
    await compose(
      '4-edit',
      'Your words, too',
      'Double-click any cue to change it. Press N to add one at the reading line.',
      await b64(site),
      await b64(prompter),
    );
    await prompter.keyboard.press('Escape');

    // 5. Dark, for dim rooms.
    await settings({ theme: 'dark' });
    await site.emulateMedia({ colorScheme: 'dark' });
    await prompter.reload();
    await site.bringToFront();
    await target(demo);
    await prompter.locator('.cue-list .cue-title').nth(5).waitFor();
    await scrollTo('What we propose for Q4');
    await awake();
    await compose(
      '5-dark',
      'Private by how you share',
      'Share the page’s tab in Zoom, Meet or Teams. Viewers see the page; your cues stay with you.',
      await b64(site),
      await b64(prompter),
      true,
    );

    // The small promo tile.
    await composer.setViewportSize({ width: 440, height: 280 });
    await composer.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: Plex; font-weight: 600; src: url(data:font/woff2;base64,${FONT600}); }
      @font-face { font-family: Plex; font-weight: 400; src: url(data:font/woff2;base64,${FONT400}); }
      body { margin: 0; width: 440px; height: 280px; background: #f3f5f8; font-family: Plex, sans-serif; color: #151a22;
        display: flex; flex-direction: column; justify-content: center; padding: 0 38px; box-sizing: border-box; }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 30px; letter-spacing: -0.01em; }
      .brand svg { width: 46px; height: 46px; }
      p { margin: 18px 0 0; font-size: 21px; line-height: 1.3; color: #3d4550; }
    </style></head><body><div class="brand">${MARK}pagecue</div>
      <p>Speaker notes for any web page, written with Claude.</p></body></html>`);
    writeFileSync(join(out, 'promo-small.png'), await composer.screenshot());
    console.log('Wrote docs/store: 5 screenshots and the small promo tile');
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
