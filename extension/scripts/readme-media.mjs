/**
 * Makes the README's pictures from the demo page (site/public/demo), so they can be redone whenever the
 * prompter changes: a still of the shared page beside the prompter, and a short GIF of the prompter
 * following the page as it scrolls.
 *
 *   PAGECUE_E2E=1 npx wxt build && node scripts/readme-media.mjs
 *
 * Writes docs/images/hero.png and docs/images/demo.gif.
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';
import { findChromium } from './chromium.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const extensionPath = resolve(here, '../.output-e2e/chrome-mv3');
const images = join(root, 'docs/images');

const SITE = { width: 1040, height: 700 };
const PROMPTER = { width: 380, height: 700 };

/** The two windows side by side, each with a caption, on a quiet background. */
const COMPOSER = `<!doctype html><html><head><style>
  body { margin: 0; background: #e9e6e1; font: 600 15px/1.3 ui-sans-serif, system-ui, -apple-system, sans-serif; color: #4b4540; }
  .stage { display: flex; gap: 22px; padding: 22px 26px 26px; align-items: flex-start; }
  .pane p { margin: 0 0 10px 2px; }
  .pane p span { font-weight: 400; color: #857c73; }
  .window { border-radius: 12px; overflow: hidden; box-shadow: 0 12px 34px rgba(40, 30, 20, 0.18), 0 0 0 1px rgba(40, 30, 20, 0.08); background: #fff; }
  .bar { height: 30px; background: #f4f1ed; border-bottom: 1px solid #e6e0d9; display: flex; align-items: center; gap: 7px; padding: 0 12px; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #ddd5cc; display: block; }
  .bar b { margin-left: 10px; font-weight: 500; font-size: 12px; color: #8b8178; }
  img { display: block; }
</style></head><body><div class="stage">
  <div class="pane"><p>Shared in Zoom <span>· the report</span></p><div class="window"><div class="bar"><i></i><i></i><i></i><b>Q3 partner review</b></div><img id="site"></div></div>
  <div class="pane"><p>Only you see <span>· pagecue</span></p><div class="window"><div class="bar"><i></i><i></i><i></i><b>pagecue</b></div><img id="prompter"></div></div>
</div></body></html>`;

async function main() {
  if (!existsSync(join(extensionPath, 'manifest.json')))
    throw new Error('Build the test variant first: PAGECUE_E2E=1 npx wxt build');
  const siteRoot = join(root, 'site/public');
  const server = createServer((req, res) => {
    let path = join(siteRoot, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.endsWith('/')) path = join(path, 'index.html');
    if (!path.startsWith(siteRoot) || !existsSync(path)) return res.writeHead(404).end();
    const type = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.css': 'text/css' }[extname(path)];
    res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' }).end(readFileSync(path));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/demo/`;

  const profile = mkdtempSync(join(tmpdir(), 'pagecue-media-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChromium(),
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: SITE,
    deviceScaleFactor: 1,
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const site = await context.newPage();
    await site.goto(url);
    const prompter = await context.newPage();
    await prompter.setViewportSize(PROMPTER);
    await prompter.goto(`chrome-extension://${extensionId}/prompter.html`);
    // Settings a first-time presenter would have dismissed already.
    await prompter.evaluate(async () => {
      const key = 'prompter-settings';
      const stored = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({ [key]: { ...stored, tipSeen: true, theme: 'light' } });
    });
    await prompter.reload();
    await prompter.evaluate(async (target) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === target);
      await chrome.storage.session.set({ target: { tabId: tab.id, at: Date.now() } });
    }, url);
    await prompter.locator('.cue-list .cue-title').nth(5).waitFor();
    await prompter.waitForTimeout(800);

    const composer = await context.newPage();
    await composer.setViewportSize({ width: SITE.width + PROMPTER.width + 74, height: SITE.height + 100 });
    await composer.setContent(COMPOSER);

    const frame = async () => {
      const [a, b] = await Promise.all([site.screenshot(), prompter.screenshot()]);
      await composer.evaluate(
        ([one, two]) =>
          Promise.all(
            [
              ['site', one],
              ['prompter', two],
            ].map(
              ([id, data]) =>
                new Promise((done) => {
                  const img = document.getElementById(id);
                  img.onload = done;
                  img.src = `data:image/png;base64,${data}`;
                }),
            ),
          ),
        [a.toString('base64'), b.toString('base64')],
      );
      return composer.screenshot();
    };

    // The still: the page at its revenue chart, the prompter on that cue.
    const scrollTo = async (heading) => {
      await site.evaluate((text) => {
        const h = [...document.querySelectorAll('h1, h2')].find((e) => e.textContent === text);
        window.scrollTo({ top: h.getBoundingClientRect().top + scrollY - innerHeight * 0.3 + 6, behavior: 'instant' });
      }, heading);
      await prompter.waitForTimeout(900);
    };
    await scrollTo('Revenue by month');
    writeFileSync(join(images, 'hero.png'), await frame());

    // The GIF: scroll down through the report, pausing on each cue.
    const stops = [
      'Q3 partner review',
      'The quarter in four numbers',
      'Revenue by month',
      'Where it sold',
      'Two things to watch',
      'What we propose for Q4',
    ];
    await scrollTo(stops[0]);
    const frames = [];
    const capture = async (delay) => {
      const png = PNG.sync.read(await frame());
      frames.push({ png, delay });
    };
    for (let i = 1; i < stops.length; i += 1) {
      await capture(i === 1 ? 1400 : 1100);
      const from = await site.evaluate(() => scrollY);
      const to = await site.evaluate((text) => {
        const h = [...document.querySelectorAll('h2')].find((e) => e.textContent === text);
        return h.getBoundingClientRect().top + scrollY - innerHeight * 0.3 + 6;
      }, stops[i]);
      for (const t of [0.2, 0.45, 0.7, 0.9]) {
        await site.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), from + (to - from) * t);
        await prompter.waitForTimeout(140);
        await capture(70);
      }
      await site.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), to);
      await prompter.waitForTimeout(700);
    }
    await capture(2200);

    // Half size keeps the GIF small enough for a README.
    const scale = 0.5;
    const width = Math.round(frames[0].png.width * scale);
    const height = Math.round(frames[0].png.height * scale);
    const gif = GIFEncoder();
    for (const { png, delay } of frames) {
      const small = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          // Average a 2x2 block: smoother text than taking every other pixel.
          for (let c = 0; c < 4; c += 1) {
            let sum = 0;
            for (const [dx, dy] of [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ]) {
              const sx = Math.min(png.width - 1, x * 2 + dx);
              const sy = Math.min(png.height - 1, y * 2 + dy);
              sum += png.data[(sy * png.width + sx) * 4 + c];
            }
            small[(y * width + x) * 4 + c] = sum / 4;
          }
        }
      }
      const palette = quantize(small, 256);
      gif.writeFrame(applyPalette(small, palette), width, height, { palette, delay });
    }
    gif.finish();
    writeFileSync(join(images, 'demo.gif'), gif.bytes());
    console.log(`Wrote docs/images/hero.png and docs/images/demo.gif (${frames.length} frames)`);
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
