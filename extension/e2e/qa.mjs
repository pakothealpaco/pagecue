/**
 * QA on real sites: runs the same presenter flow on each URL with the `PAGECUE_QA=1` build (which may
 * access every site) and reports what worked.
 *
 * For each site: connect the prompter, scroll the page in three steps (the scrolling area under the
 * middle of the window, inside frames too, as a person's wheel would), add a cue at each step, scroll back
 * and check each cue lights up at its place, then reload and check the cues come back.
 *
 *   PAGECUE_QA=1 npx wxt build && node e2e/qa.mjs [url ...] [--out dir]
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '../.output-qa/chrome-mv3');

const DEFAULT_SITES = [
  'https://en.wikipedia.org/wiki/Teleprompter',
  'https://paulgraham.com/greatwork.html',
  'https://github.com/microsoft/TypeScript',
  'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe',
  'https://docusaurus.io/docs',
  'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
  'https://monday.com/',
  'https://30days.streamlit.app/',
  'https://observablehq.com/@d3/gallery',
  'https://huggingface.co/spaces/gradio/hello_world',
];

function findChromium() {
  if (process.env.PAGECUE_CHROMIUM) return process.env.PAGECUE_CHROMIUM;
  try {
    const bundled = chromium.executablePath();
    if (existsSync(bundled)) return bundled;
  } catch {
    // fall through
  }
  const cache = join(
    homedir(),
    process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright',
  );
  for (const dir of existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort()
        .reverse()
    : []) {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn().catch(() => undefined);
    if (last) return last;
    await sleep(100);
  }
  return last;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args.splice(outIndex, 2)[1] : join(tmpdir(), 'pagecue-qa');
  mkdirSync(out, { recursive: true });
  const sites = args.length ? args : DEFAULT_SITES;

  const profile = mkdtempSync(join(tmpdir(), 'pagecue-qa-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChromium(),
    headless: process.env.HEADED !== '1',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: { width: 1280, height: 800 },
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const results = [];

  for (const [n, url] of sites.entries()) {
    const result = { url, connected: false, frame: false, added: 0, lit: [], reload: 0, notes: [] };
    results.push(result);
    const site = await context.newPage();
    const prompter = await context.newPage();
    await prompter.setViewportSize({ width: 440, height: 800 });
    const titles = () => prompter.locator('.cue-list .cue-title').allTextContents();
    const active = () =>
      prompter.evaluate(() => document.querySelector('.cue[aria-current] .cue-title')?.textContent ?? null);
    const emptyTitle = () => prompter.evaluate(() => document.querySelector('.empty h2')?.textContent ?? null);
    /**
     * Scrolls the page's main scrolling area (the window, an inner area or one in a frame: whichever
     * can scroll the furthest) to `y`, as a person scrolling would. Returns where it ended up.
     */
    const scrollPage = async (y) => {
      // Follow the middle of the window down through frames, as a person's wheel would.
      let frame = site.mainFrame();
      let x = 640;
      let top = 400;
      for (let depth = 0; depth < 4; depth += 1) {
        const handle = await frame
          .evaluateHandle(([px, py]) => document.elementFromPoint(px, py), [x, top])
          .catch(() => null);
        const element = handle?.asElement();
        if (!element || (await element.evaluate((e) => e.tagName)) !== 'IFRAME') break;
        const box = await element.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return { left: r.left, top: r.top };
        });
        const inner = await element.contentFrame();
        if (!inner) break;
        frame = inner;
        x -= box.left;
        top -= box.top;
      }
      return frame
        .evaluate(
          ([px, py, target]) => {
            let e = document.elementFromPoint(px, py);
            while (e && e !== document.documentElement) {
              const style = getComputedStyle(e);
              // A real scrolling area, not a code block or a small list that happens to be there.
              if (
                /(auto|scroll)/.test(style.overflowY) &&
                e.scrollHeight > e.clientHeight + 400 &&
                e.clientHeight > innerHeight / 2
              )
                break;
              e = e.parentElement;
            }
            const scroller = e && e !== document.documentElement ? e : document.scrollingElement;
            scroller.scrollTop = target;
            return scroller.scrollTop;
          },
          [x, top, y],
        )
        .catch(() => 0);
    };
    /** The mouse wheel, from the top: for pages where the middle of the window is an embed. */
    const wheel = async (y) => {
      await site.mouse.move(640, 450);
      await site.mouse.wheel(0, -200000);
      await sleep(300);
      for (let left = y; left > 0; left -= 400) {
        await site.mouse.wheel(0, Math.min(400, left));
        await sleep(50);
      }
      await sleep(300);
      return site.evaluate(() => scrollY).catch(() => 0);
    };
    let useWheel = false;
    const wheelTo = async (y) => {
      await site.bringToFront();
      if (useWheel) await wheel(y);
      else await scrollPage(y);
      await sleep(900);
    };
    try {
      await site
        .goto(url, { waitUntil: 'load', timeout: 45000 })
        .catch((e) => result.notes.push(`load: ${e.message.split('\n')[0]}`));
      await sleep(3000);
      await prompter.goto(`chrome-extension://${extensionId}/prompter.html`);
      await prompter.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        // The newest tab that is not an extension page: the site just opened.
        const tab = tabs
          .filter((t) => t.url && !t.url.startsWith('chrome-extension://') && t.url !== 'about:blank')
          .sort((a, b) => b.id - a.id)[0];
        await chrome.storage.session.set({ target: { tabId: tab.id, at: Date.now() } });
      });
      result.connected = Boolean(
        await until(async () => {
          const t = await emptyTitle();
          return t === 'No cues yet' || (await titles()).length > 0 || t?.includes('frame');
        }, 15000),
      );
      // A page that hands itself to a frame does so within a few seconds: wait until that settles.
      const frameNow = () =>
        prompter.evaluate(async () =>
          JSON.stringify((await chrome.storage.session.get('mainFrames')).mainFrames ?? {}),
        );
      let frames = await frameNow();
      const settleFrom = Date.now();
      for (let stable = 0; stable < 3 || Date.now() - settleFrom < 10000;) {
        await sleep(1000);
        const next = await frameNow();
        stable = next === frames ? stable + 1 : 0;
        frames = next;
      }
      frames = JSON.parse(frames);
      result.emptyState = await emptyTitle();
      if (!result.connected) throw new Error(`not connected (${result.emptyState})`);

      // How far the page scrolls (the window, an inner area or a frame): spread the steps over it.
      await site.bringToFront();
      let range = Math.min(6000, await scrollPage(6000));
      await scrollPage(0);
      if (range < 900) {
        const wheeled = Math.min(6000, await wheel(6000));
        if (wheeled > range) {
          range = wheeled;
          useWheel = true;
        }
      }
      result.range = range;
      if (range < 900) result.notes.push(`the page scrolls only ${range}px: lit checks are not meaningful`);
      const steps = [0.15, 0.45, 0.75].map((share) => Math.round(range * share));
      for (const [k, y] of steps.entries()) {
        await wheelTo(y);
        const before = (await titles()).length;
        const pressed = Date.now();
        await prompter.keyboard.press('n');
        const headline = prompter.getByLabel('Headline');
        const opened = await until(() => headline.isVisible(), 4000);
        (result.addMs ??= []).push(Date.now() - pressed);
        if (!opened && process.env.QA_VERBOSE) {
          console.log(
            '    frames:',
            JSON.stringify(
              await prompter.evaluate(async () => {
                const tab = (await chrome.tabs.query({}))
                  .filter((t) => t.url && !t.url.startsWith('chrome-extension://'))
                  .sort((a, b) => b.id - a.id)[0];
                const res = await chrome.scripting.executeScript({
                  target: { tabId: tab.id, allFrames: true },
                  func: () => [
                    location.href.slice(0, 50),
                    !!window.__pagecueLoaded,
                    innerHeight * 0.3,
                    document.elementFromPoint(innerWidth / 2, innerHeight * 0.3)?.tagName,
                  ],
                });
                return {
                  map: (await chrome.storage.session.get('mainFrames')).mainFrames,
                  res: res.map((r) => [r.frameId, ...r.result]),
                };
              }),
            ),
          );
        }
        if (!opened) {
          result.notes.push(
            `step ${k + 1}: no editor (${await prompter
              .locator('.toast')
              .textContent()
              .catch(() => '')})`,
          );
          continue;
        }
        await headline.fill(`QA ${k + 1}`);
        await prompter.getByRole('button', { name: 'Done' }).click();
        if (await until(async () => (await titles()).length > before, 4000)) result.added += 1;
      }
      result.anchors = await prompter.evaluate(async (host) => {
        const all = await chrome.storage.local.get(null);
        return Object.entries(all)
          .filter(([key]) => key.startsWith('site:') && key.includes(host))
          .flatMap(([, site]) => site?.cues ?? [])
          .filter((cue) => cue.title?.startsWith('QA'))
          .map(
            (cue) =>
              `${cue.title}: <${cue.anchor.tag}> ${cue.anchor.selector ?? ''}“${(cue.anchor.text ?? '').slice(0, 30)}” @${cue.startAt}`,
          );
      }, new URL(url).host);
      for (const [k, y] of steps.entries()) {
        await wheelTo(y + 60);
        const now = await until(active, 3000);
        result.lit.push(now === `QA ${k + 1}` ? '✓' : `✗(${now})`);
      }
      const mainFrames = await prompter.evaluate(
        async () => (await chrome.storage.session.get('mainFrames')).mainFrames,
      );
      result.frame = Object.values(mainFrames ?? frames ?? {}).some((f) => f !== 0);
      await site.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => undefined);
      await sleep(3000);
      result.reload =
        (await until(async () => {
          const qa = (await titles()).filter((t) => t.startsWith('QA'));
          return qa.length >= result.added ? qa.length : 0;
        }, 15000)) || (await titles()).filter((t) => t.startsWith('QA')).length;
    } catch (error) {
      result.notes.push(error.message.split('\n')[0]);
    }
    const name = String(n + 1).padStart(2, '0');
    await site.screenshot({ path: join(out, `${name}-site.png`) }).catch(() => undefined);
    await prompter.screenshot({ path: join(out, `${name}-prompter.png`) }).catch(() => undefined);
    await site.close();
    await prompter.close();
    if (process.env.QA_VERBOSE) console.log(`    ${(result.anchors ?? []).join('\n    ')}`);
    const ok = result.connected && result.added === 3 && result.lit.every((x) => x === '✓') && result.reload === 3;
    console.log(
      `${ok ? '✓' : '✗'} ${url}\n    connected ${result.connected}${result.frame ? ' (in a frame)' : ''}, added ${result.added}/3, lit ${result.lit.join(' ')}, after reload ${result.reload}/3, add ${(result.addMs ?? []).join('/')} ms${result.notes.length ? `\n    ${result.notes.join('; ')}` : ''}`,
    );
  }
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
