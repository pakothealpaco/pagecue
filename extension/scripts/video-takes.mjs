/**
 * Records the real extension on the demo report for the marketing video: the shared page and the
 * prompter as two frame sequences with their times, plus takes.json with when each take starts.
 * docs/video/build/ is where the cut is made (see docs/video/script-30s.md).
 *
 *   PAGECUE_QA=1 npx wxt build && node scripts/video-takes.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium } from './chromium.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
// VIDEO_LIVE=1: the real thing. The page is the live sample page and the prompter talks to the
// presenter's own pagecue bridge (port 47613), so cues Claude sends from claude.ai arrive during the take.
const live = process.env.VIDEO_LIVE === '1';
const extensionPath = live
  ? resolve(here, '../../docs/video/build/ext-live')
  : resolve(here, '../.output-qa/chrome-mv3');
const out = join(root, 'docs/video/build');
// Narrow enough that the report stacks into one column, so each cue gets its own stretch of page.
const SITE = { width: 840, height: 780 };
const PROMPTER = { width: 440, height: 780 };

async function main() {
  if (!existsSync(join(extensionPath, 'manifest.json')))
    throw new Error('Build the QA variant first: PAGECUE_QA=1 npx wxt build');
  mkdirSync(out, { recursive: true });
  // The site's sample page (usepagecue.com/sample), served here under its own name.
  const siteRoot = join(root, 'site/public');
  const server = createServer((req, res) => {
    let path = join(siteRoot, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.endsWith('/')) path = join(path, 'index.html');
    if (!path.startsWith(siteRoot) || !existsSync(path)) return res.writeHead(404).end();
    const type = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' }[extname(path)];
    res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' }).end(readFileSync(path));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const demo = live ? 'https://usepagecue.com/sample/' : 'http://usepagecue.com/sample/';
  // A bridge of its own (the QA build talks to port 47614), with the cues Claude wrote for this page
  // in claude.ai (docs/video/build/sample-cues.json), published during the take as Claude did.
  const bridgePath = resolve(root, 'plugins/pagecue/server/bridge.mjs');
  const bridgeHome = mkdtempSync(join(tmpdir(), 'pagecue-video-bridge-'));
  const bridgeEnv = { ...process.env, PAGECUE_HOME: bridgeHome, PAGECUE_PORT: '47614' };
  const bridge = live ? null : spawn(process.execPath, [bridgePath, 'serve'], { env: bridgeEnv, stdio: 'ignore' });
  await new Promise((done) => setTimeout(done, 800));
  const publish = () =>
    execFileSync(process.execPath, [bridgePath, 'publish', demo, join(out, 'sample-cues.json')], { env: bridgeEnv });
  const profile = mkdtempSync(join(tmpdir(), 'pagecue-video-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChromium(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      ...(live ? [] : [`--host-resolver-rules=MAP usepagecue.com:80 127.0.0.1:${server.address().port}`]),
    ],
    viewport: SITE,
    // Twice the pixels, so the cut can push in on a detail and stay sharp.
    deviceScaleFactor: 2,
  });
  const takes = {};
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const site = await context.newPage();
    await site.goto(demo);
    const prompter = await context.newPage();
    await prompter.setViewportSize(PROMPTER);
    await prompter.goto(`chrome-extension://${extensionId}/prompter.html`);
    await prompter.evaluate(async () => {
      const key = 'prompter-settings';
      const stored = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({
        [key]: { ...stored, tipSeen: true, linesExplained: true, sectionLines: false, theme: 'light', textScale: 1.15 },
      });
    });
    await prompter.reload();
    await prompter.evaluate(async (u) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
      await chrome.storage.session.set({ target: { tabId: tab.id, at: Date.now() } });
    }, demo);
    await prompter.locator('.empty').waitFor();
    await site.bringToFront();

    // Each page is captured frame by frame, with the time of each frame, so the cut plays in real time.
    const t0 = Date.now();
    let recording = true;
    const record = async (page, name) => {
      const dir = join(out, `frames-${name}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir);
      const frames = [];
      while (recording) {
        const at = (Date.now() - t0) / 1000;
        const file = `${String(frames.length).padStart(5, '0')}.jpg`;
        writeFileSync(join(dir, file), await page.screenshot({ type: 'jpeg', quality: 92 }));
        frames.push({ file, at });
      }
      writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames));
      return frames.length;
    };
    const recorders = [record(site, 'site'), record(prompter, 'prompter')];

    // Screenshots have no mouse pointer, so the prompter gets a drawn one for the video.
    await prompter.evaluate(() => {
      const dot = document.createElement('div');
      dot.style.cssText =
        'position:fixed;z-index:99999;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
        'background:rgba(30,158,99,.25);border:2px solid #1e9e63;pointer-events:none;opacity:0;transition:transform .15s,opacity .2s';
      document.body.append(dot);
      addEventListener('mousemove', (e) => {
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
        dot.style.opacity = '1';
      });
      addEventListener('mousedown', () => (dot.style.transform = 'scale(.7)'));
      addEventListener('mouseup', () => (dot.style.transform = 'scale(1)'));
    });

    const mark = (name) => {
      takes[name] = (Date.now() - t0) / 1000;
    };
    /** Scrolls the page smoothly to a heading, over `ms`, the way a wheel would. */
    const glideTo = (heading, ms) =>
      site.evaluate(
        ([text, duration]) =>
          new Promise((done) => {
            const h = [...document.querySelectorAll('h1, h2')].find((e) => e.textContent.trim().startsWith(text));
            const from = scrollY;
            const to = text === 'top' ? 0 : h.getBoundingClientRect().top + scrollY - innerHeight * 0.3 + 6;
            const start = performance.now();
            const step = (now) => {
              const t = Math.min(1, (now - start) / duration);
              const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
              window.scrollTo(0, from + (to - from) * ease);
              if (t < 1) requestAnimationFrame(step);
              else done();
            };
            requestAnimationFrame(step);
          }),
        [heading, ms],
      );
    const pause = (ms) => site.waitForTimeout(ms);

    // Settle, then take 1: the page on its own, drifting down a little.
    await pause(2500);
    mark('report');
    await glideTo('Activation jumped', 4200);
    await pause(800);
    await glideTo('top', 10);

    // Take 2: the prompter has no cues yet; Claude's cues arrive.
    await pause(1200);
    mark('arrive');
    await pause(1500);
    if (live) console.log('Recording. Ask Claude in claude.ai now; waiting for its cues…');
    else publish();
    await prompter
      .locator('.cue-list .cue-title')
      .nth(2)
      .waitFor({ timeout: live ? 400000 : 15000 });
    mark('arrived');
    await pause(2500);

    // Take 3: from the top, the page scrolls and the prompter follows.
    mark('follow');
    await pause(900);
    await glideTo('Activation jumped', 1800);
    await pause(1100);
    await glideTo('Where new teams', 1800);
    await pause(1100);
    await glideTo('What customers', 1800);
    await pause(1500);

    // Take 4: still, on one section, for "viewers see the page".
    mark('private');
    await pause(1200);
    await glideTo('Plan for Q4', 2200);
    await pause(3000);

    // Take 5: click a cue in the prompter (the page jumps), then edit a word in place.
    await glideTo('top', 10);
    await glideTo('Activation jumped', 10);
    await pause(1500);
    mark('click');
    await pause(500);
    const cue = prompter.locator('.cue').nth(2);
    const box = await cue.boundingBox();
    await prompter.mouse.move(box.x + 60, box.y + 20, { steps: 12 });
    await pause(250);
    await prompter.mouse.click(box.x + 60, box.y + 20);
    await pause(1800);
    const lit = prompter.locator('.cue.is-lit');
    await lit.dblclick();
    await prompter.locator('.cue.is-editing .cue-title.field').waitFor();
    await pause(500);
    await prompter.keyboard.press('ArrowRight');
    // The edit: swap the title's last words for the number behind them, the way a presenter
    // makes a headline say the figure. With other cues, the last word gets an emphasis.
    const title = (
      await prompter.locator('.cue.is-editing .cue-title.field').evaluate((e) => e.value ?? e.textContent)
    ).trim();
    const [replace, by] = / new teams$/.test(title)
      ? ['new teams', 'signups']
      : / most signups$/.test(title)
        ? ['most signups', '38% of signups']
        : [title.split(' ').at(-1), title.split(' ').at(-1).toUpperCase()];
    for (let i = 0; i < replace.length; i++) await prompter.keyboard.press('Shift+ArrowLeft');
    await pause(400);
    await prompter.keyboard.type(by, { delay: 80 });
    await pause(700);
    const done = await prompter.locator('.done-button').boundingBox();
    await prompter.mouse.move(done.x + done.width / 2, done.y + done.height / 2, { steps: 14 });
    await pause(200);
    await prompter.mouse.click(done.x + done.width / 2, done.y + done.height / 2);
    await pause(300);
    await prompter.mouse.move(430, 770, { steps: 8 });
    await pause(2000);
    mark('end');
    recording = false;
    const counts = await Promise.all(recorders);
    writeFileSync(join(out, 'takes.json'), JSON.stringify(takes, null, 2));
    console.log('Wrote docs/video/build: frames-site, frames-prompter, takes.json', counts, takes);
  } finally {
    await context.close();
    server.close();
    bridge?.kill();
    rmSync(bridgeHome, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
