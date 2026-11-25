// End-to-end test: loads the built extension into a real Chromium and checks the whole loop on
// two fixture pages (a long report that ships a cue file, and a dashboard that scrolls an inner
// container). Build first with `PAGECUE_E2E=1 npx wxt build`; `npm run e2e` does both.
//
// Chromium: set PAGECUE_CHROMIUM to a Chromium or Chrome for Testing binary, or install one with
// `npx playwright install chromium`. Branded Google Chrome cannot load unpacked extensions this way.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '../.output-e2e/chrome-mv3');
const fixtures = join(here, 'fixtures');

function findChromium() {
  if (process.env.PAGECUE_CHROMIUM) return process.env.PAGECUE_CHROMIUM;
  try {
    const bundled = chromium.executablePath();
    if (existsSync(bundled)) return bundled;
  } catch {
    // fall through to the cache search
  }
  const cache =
    process.platform === 'darwin'
      ? join(homedir(), 'Library/Caches/ms-playwright')
      : join(homedir(), '.cache/ms-playwright');
  for (const dir of existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort()
        .reverse()
    : []) {
    const candidates = [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-linux64/chrome',
      'chrome-linux/chrome',
      'chrome-win64/chrome.exe',
    ].map((rel) => join(cache, dir, rel));
    const found = candidates.find(existsSync);
    if (found) return found;
  }
  throw new Error('No Chromium found. Run `npx playwright install chromium` or set PAGECUE_CHROMIUM.');
}

/** Another origin pagecue may access (127.0.0.1 on a second port), for pages shown in a frame. */
let frameOrigin = '';

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const path = join(fixtures, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(fixtures) || !existsSync(path)) {
      res.writeHead(404).end();
      return;
    }
    let body = readFileSync(path);
    // A second origin for the same server: same host and port under a different name.
    if (extname(path) === '.html')
      body = body
        .toString()
        .replaceAll('__OTHER_ORIGIN__', `http://localhost:${server.address().port}`)
        .replaceAll('__FRAME_ORIGIN__', frameOrigin);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/** Runs the plugin's MCP server the way Claude Code does (JSON-RPC over stdio). */
function startMcp(home) {
  const bridge = resolve(here, '../../plugins/pagecue/server/bridge.mjs');
  const child = spawn(process.execPath, [bridge, 'mcp'], {
    env: { ...process.env, PAGECUE_HOME: home, PAGECUE_PORT: '47614' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  let next = 1;
  const request = (method, params) =>
    new Promise((done) => {
      const id = next++;
      waiting.set(id, done);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  return {
    request,
    async tool(name, args = {}) {
      const { result } = await request('tools/call', { name, arguments: args });
      return { text: result.content[0].text, error: !!result.isError };
    },
    stop: () => child.kill(),
  };
}

const steps = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    steps.push(`  ✓ ${name} (${Date.now() - started} ms)`);
    console.log(steps.at(-1));
  } catch (error) {
    console.log(`  ✗ ${name}`);
    throw error;
  }
}

/** Polls until `fn` returns a truthy value. */
async function until(fn, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out: ${message} (last value: ${JSON.stringify(last)})`);
}

async function main() {
  assert.ok(
    existsSync(join(extensionPath, 'manifest.json')),
    `Build the e2e variant first: ${extensionPath} is missing.`,
  );
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const frameServer = await serve();
  frameOrigin = `http://127.0.0.1:${frameServer.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), 'pagecue-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChromium(),
    headless: process.env.HEADED !== '1',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: { width: 1200, height: 800 },
  });

  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;

    const site = await context.newPage();
    const prompter = await context.newPage();
    await prompter.setViewportSize({ width: 440, height: 800 });

    /** Points the prompter at the tab showing `url`, as the toolbar button does. */
    async function follow(url) {
      await site.goto(url);
      await site.bringToFront();
      await prompter.goto(`chrome-extension://${extensionId}/prompter.html`);
      await prompter.evaluate(async (target) => {
        const tab = (await chrome.tabs.query({})).find((t) => t.url === target);
        await chrome.storage.session.set({ target: { tabId: tab.id, at: Date.now() } });
      }, url);
    }

    const readingLine = () => site.evaluate(() => window.innerHeight * 0.3);
    const topOf = (selector) => site.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, selector);
    const activeTitle = () =>
      prompter.evaluate(() => document.querySelector('.cue[aria-current] .cue-title')?.textContent ?? null);
    const cardTitles = () => prompter.locator('.cue-list .cue-title').allTextContents();

    console.log('\nReport page (cue file + data-pagecue attributes)');

    await step('loads the cues the site ships, in page order', async () => {
      await follow(`${origin}/report.html`);
      await until(async () => (await cardTitles()).length === 4, 'four cue cards');
      assert.deepEqual(await cardTitles(), [
        'Revenue up 24% in Q3',
        'Costs rose, then flattened',
        'Churn down to 2.1%',
        'Pipeline 1.8x quota',
      ]);
      const bullets = await prompter.locator('.cue-list .cue').nth(2).locator('.cue-points li').allTextContents();
      assert.equal(bullets.length, 3);
    });

    await step('page scroll moves the prompter to the matching cue', async () => {
      await site.evaluate(() => {
        const top = document.querySelector('#churn').getBoundingClientRect().top + scrollY;
        scrollTo({ top: top - innerHeight * 0.3 + 40, behavior: 'instant' });
      });
      await until(async () => (await activeTitle()) === 'Churn down to 2.1%', 'churn cue active');
    });

    await step('clicking a cue scrolls the page to its element at the reading line', async () => {
      await prompter.locator('.cue-list .cue').nth(1).click();
      const line = await readingLine();
      await until(async () => Math.abs((await topOf('#costs')) - line) < 4, 'costs section at the reading line');
      assert.equal(await activeTitle(), 'Costs rose, then flattened');
    });

    await step('scrolling the prompter scrolls the page, without echo', async () => {
      await prompter.bringToFront();
      const before = await site.evaluate(() => scrollY);
      const list = prompter.getByTestId('cue-list');
      await list.hover();
      for (let i = 0; i < 6; i += 1) await prompter.mouse.wheel(0, 60);
      await until(async () => (await site.evaluate(() => scrollY)) > before + 50, 'page followed the prompter');
      // Once both sides settle, neither keeps nudging the other.
      await new Promise((r) => setTimeout(r, 600));
      const samples = [];
      for (let i = 0; i < 8; i += 1) {
        samples.push(await site.evaluate(() => scrollY));
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(Math.max(...samples) - Math.min(...samples) < 2, `page kept moving: ${samples.join(', ')}`);
    });

    await step('keyboard steps through cues', async () => {
      await prompter.bringToFront();
      await prompter.locator('.cue-list .cue').nth(0).click();
      await prompter.keyboard.press('PageDown');
      await prompter.keyboard.press('PageDown');
      await until(async () => (await activeTitle()) === 'Churn down to 2.1%', 'third cue after two steps');
      const line = await readingLine();
      await until(async () => Math.abs((await topOf('#churn')) - line) < 4, 'churn at the reading line');
    });

    if (process.env.PAGECUE_SCREENSHOTS) {
      const shots = process.env.PAGECUE_SCREENSHOTS;
      await prompter.mouse.move(5, 400);
      await new Promise((r) => setTimeout(r, 2600)); // let the chrome fade
      await prompter.screenshot({ path: join(shots, 'prompter-present.png') });
      await prompter.mouse.move(200, 300);
      await prompter.locator('.menu-button').click();
      await new Promise((r) => setTimeout(r, 300));
      await prompter.screenshot({ path: join(shots, 'prompter-menu.png') });
      await prompter.getByRole('button', { name: 'Dark' }).click();
      await prompter.keyboard.press('Escape');
      await prompter.mouse.move(5, 400);
      await new Promise((r) => setTimeout(r, 2600));
      await prompter.screenshot({ path: join(shots, 'prompter-dark.png') });
      await prompter.mouse.move(200, 300);
      await prompter.locator('.menu-button').click();
      await prompter.getByRole('button', { name: 'Auto' }).click();
      await prompter.keyboard.press('Escape');
      await site.screenshot({ path: join(shots, 'site.png') });
    }

    await step('pagecue draws nothing on the shared page', async () => {
      const added = await site.evaluate(
        () =>
          [...document.querySelectorAll('body *, html > *')].filter((el) => /pagecue/i.test(el.id) || el.shadowRoot)
            .length,
      );
      assert.equal(added, 0);
      assert.equal(await site.evaluate(() => document.documentElement.getAttribute('style')), null);
    });

    await step('double-click edits a cue in place; the edit survives a reload and a re-read cue file', async () => {
      await prompter.bringToFront();
      await prompter.locator('.cue-list .cue').nth(0).dblclick();
      const headline = prompter.getByLabel('Headline');
      await headline.fill('Revenue: +24% (my words)');
      await prompter.getByLabel('Points, one per line').fill('EU launch\nKey number: 24%');
      await prompter.locator('.page-name').click(); // clicking away saves (and opens the site list)
      await prompter.locator('.sheet').getByRole('button', { name: 'Done' }).click();
      await until(async () => (await cardTitles())[0] === 'Revenue: +24% (my words)', 'edit saved');
      await site.reload();
      // Wait for the reconnect to finish: right after the reload the old list can still be showing.
      await until(async () => {
        const titles = await cardTitles();
        return titles.length === 4 && titles[0] === 'Revenue: +24% (my words)';
      }, 'edit survived the reload');
    });

    await step('Esc cancels an edit', async () => {
      await prompter.locator('.cue-list .cue').nth(1).dblclick();
      await prompter.getByLabel('Headline').fill('Throw this away');
      await prompter.keyboard.press('Escape');
      await until(async () => (await cardTitles())[1] === 'Costs rose, then flattened', 'original text back');
    });

    console.log('\nDashboard page (inner scroll container, inline cue file)');

    await step('loads inline cues on a page that scrolls an inner container', async () => {
      await follow(`${origin}/dashboard.html`);
      await until(async () => (await cardTitles()).join() === 'Metric 3 is up 21%,Metric 8 needs attention', 'cues');
    });

    await step('inner-container scroll drives the prompter and the prompter drives it', async () => {
      await site.evaluate(() => {
        const scroller = document.getElementById('scroller');
        const card = document.querySelectorAll('.card')[7];
        scroller.scrollTop = card.offsetTop - scroller.clientHeight * 0.3 + 20;
      });
      await until(async () => (await activeTitle()) === 'Metric 8 needs attention', 'Metric 8 active');
      await prompter.locator('.cue-list .cue').nth(0).click();
      await until(
        async () =>
          site.evaluate(() => {
            const scroller = document.getElementById('scroller');
            const card = document.querySelectorAll('.card')[2];
            const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.3;
            return Math.abs(card.getBoundingClientRect().top - line) < 4;
          }),
        'Metric 3 at the reading line of the inner container',
      );
    });

    await step('P pauses following, and the cue light says so', async () => {
      await prompter.bringToFront();
      await prompter.keyboard.press('p');
      await until(async () => (await prompter.locator('.light.is-standby').count()) === 1, 'amber light');
      const before = await activeTitle();
      await site.evaluate(() => {
        const scroller = document.getElementById('scroller');
        scroller.scrollTop = document.querySelectorAll('.card')[7].offsetTop - scroller.clientHeight * 0.3 + 20;
      });
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(await activeTitle(), before, 'paused prompter must not follow the page');
      await prompter.keyboard.press('p');
      await until(async () => (await prompter.locator('.light.is-live').count()) === 1, 'green light');
    });

    console.log('\nSingle-page app and cue file rules');

    await step('switching routes in a single-page app switches the cue set', async () => {
      await follow(`${origin}/spa.html#/overview`);
      await until(async () => (await cardTitles()).join() === 'Traffic,Signups', 'overview cues');
      await site.evaluate(() => (location.hash = '#/details'));
      await until(async () => (await cardTitles()).join() === 'Funnel,Retention,Revenue', 'details cues');
      await site.evaluate(() => (location.hash = '#/overview'));
      await until(async () => (await cardTitles()).join() === 'Traffic,Signups', 'back to overview cues');
    });

    await step('a page that rewrites its own address while scrolling (?p=2) keeps its cues', async () => {
      await follow(`${origin}/report.html`);
      await until(async () => (await cardTitles()).length >= 4, 'report cues');
      const count = (await cardTitles()).length;
      await site.evaluate(() => history.replaceState(null, '', `${location.pathname}?p=2`));
      await new Promise((r) => setTimeout(r, 1500)); // past the address poll
      assert.equal((await cardTitles()).length, count, 'cues stay after replaceState');
      await site.evaluate(() => history.replaceState(null, '', location.pathname));
    });

    await step('a page shown inside a frame from another site: cues follow the frame', async () => {
      await follow(`${origin}/framed.html`);
      await until(async () => (await cardTitles()).length === 4, 'four cues from the framed content', 8000);
      const frame = site.frames().find((f) => f.url().startsWith(frameOrigin));
      assert.ok(frame, 'content frame');
      await frame.evaluate(() => {
        const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Risks');
        scrollTo({ top: heading.getBoundingClientRect().top + scrollY - innerHeight * 0.3 + 40, behavior: 'instant' });
      });
      await until(
        async () => (await activeTitle()) === 'Two risks to watch',
        'scrolling the frame moves the prompter',
        8000,
      );
      await prompter.locator('.cue-list .cue').nth(1).click();
      await until(
        async () =>
          frame.evaluate(() => {
            const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'What it costs');
            return Math.abs(heading.getBoundingClientRect().top - innerHeight * 0.3) < 60;
          }),
        'clicking a cue scrolls the frame',
      );
    });

    await step('a frame pagecue may not read yet: the prompter asks for access', async () => {
      await follow(`${origin}/framed-blocked.html`);
      await prompter.getByText('This page shows its content in a frame').waitFor({ timeout: 8000 });
      await prompter.getByRole('button', { name: 'Allow on localhost' }).waitFor();
    });

    await step('cues in any language get their script’s direction and glyphs', async () => {
      await follow(`${origin}/languages.html`);
      await until(async () => (await cardTitles()).length === 15, 'fifteen languages');
      const tags = await prompter.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('.cue')].map((c) => [c.dataset.cueId, `${c.lang || '-'} ${c.dir}`]),
        ),
      );
      assert.deepEqual(
        {
          zh: tags.zh,
          ja: tags.ja,
          ko: tags.ko,
          ar: tags.ar,
          he: tags.he,
          hi: tags.hi,
          th: tags.th,
          fr: tags.fr,
          ru: tags.ru,
        },
        {
          zh: 'zh ltr',
          ja: 'ja ltr',
          ko: 'ko ltr',
          ar: 'ar rtl',
          he: 'he rtl',
          hi: 'hi ltr',
          th: 'th ltr',
          fr: '- ltr',
          ru: '- ltr',
        },
      );
    });

    await step('a cue file on another origin is refused; the page’s own attributes still work', async () => {
      await follow(`${origin}/cross-origin.html`);
      await prompter.getByText(/must be on the same site/).waitFor();
      // The attribute becomes a cue titled after its element; nothing comes from the refused file.
      await until(async () => (await cardTitles()).join() === 'Summary', 'placeholder cue from the attribute');
    });

    await step('the sites sheet lists every site with cues', async () => {
      await prompter.locator('.page-name').click();
      const rows = prompter.locator('.site-row');
      await until(async () => (await rows.count()) >= 3, 'sites in the list');
      const text = (await rows.allTextContents()).join(' | ');
      assert.match(text, /Q3 business review/);
      assert.match(text, /Ops dashboard/);
      assert.match(text, /Single-page app/);
      await prompter.getByRole('button', { name: 'Done' }).click();
    });

    await step('a site can be renamed, and the menu and S open the site list', async () => {
      await prompter.locator('.menu-button').click();
      await prompter.getByRole('menuitem', { name: /Sites/ }).click();
      await prompter.getByRole('button', { name: 'Rename Ops dashboard' }).click();
      const field = prompter.locator('.row-rename');
      await field.fill('Weekly ops');
      await field.press('Enter');
      await until(
        async () => (await prompter.locator('.row-title').allTextContents()).includes('Weekly ops'),
        'new name',
      );
      // Clearing the name goes back to the page title.
      await prompter.getByRole('button', { name: 'Rename Weekly ops' }).click();
      await field.fill('');
      await field.press('Enter');
      await until(
        async () => (await prompter.locator('.row-title').allTextContents()).includes('Ops dashboard'),
        'page title back',
      );
      await prompter.getByRole('button', { name: 'Done' }).click();
      await prompter.keyboard.press('s');
      await prompter.locator('.sheet').waitFor();
      await prompter.getByRole('button', { name: 'Done' }).click();
    });

    await step('choosing a site with cues opens it and follows it', async () => {
      // The page in the tab is the cross-origin fixture now, so the report has no open tab.
      await prompter.locator('.page-name').click();
      const pagesBefore = context.pages().length;
      await prompter.locator('.site-row .row', { hasText: 'Q3 business review' }).click();
      await until(async () => context.pages().length === pagesBefore + 1, 'a new tab for the report');
      await until(async () => (await cardTitles()).length === 4, 'the report cues');
      assert.ok((await cardTitles()).includes('Costs rose, then flattened'), 'report cues shown');
      // Choosing it again goes to the tab that is already open instead of opening another.
      await prompter.locator('.page-name').click();
      await prompter.locator('.site-row .row', { hasText: 'Q3 business review' }).click();
      await new Promise((r) => setTimeout(r, 600));
      assert.equal(context.pages().length, pagesBefore + 1, 'no second tab');
    });

    console.log('\nSection lines');

    await step('L shows section lines on the page; dragging one moves where its cue starts', async () => {
      await follow(`${origin}/report.html`);
      await until(async () => (await cardTitles()).length === 4, 'report cues');
      assert.equal(await site.locator('pagecue-sections').count(), 0, 'no lines until asked');
      await prompter.bringToFront();
      await prompter.keyboard.press('l');
      const tags = site.locator('pagecue-sections .tag');
      await until(async () => (await tags.count()) === 4, 'a line for every cue');
      await prompter.locator('.lines-toggle[aria-pressed="true"]').waitFor();
      await prompter
        .getByText(/viewers see them/)
        .first()
        .waitFor();

      await site.bringToFront();
      // Bring the third cue's line into view (the lines follow the page as it scrolls).
      const start = (await tags.nth(2).boundingBox()).y;
      await site.evaluate((top) => scrollBy(0, top - innerHeight / 2), start);
      await until(async () => Math.abs((await tags.nth(2).boundingBox()).y - start) > 50, 'lines follow the scroll');
      await new Promise((r) => setTimeout(r, 300));
      const box = await tags.nth(2).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await site.mouse.move(x, y);
      await site.mouse.down();
      await site.mouse.move(x, y + 60, { steps: 6 });
      await site.mouse.up();
      const stored = async () =>
        prompter.evaluate(async () => {
          const all = await chrome.storage.local.get(null);
          return Object.values(all)
            .flatMap((record) => record?.cues ?? [])
            .find((cue) => typeof cue.startAt === 'number' && cue.startAt !== 0)?.startAt;
        });
      await until(async () => (await stored()) > 0, 'the new start is saved');
      const moved = await tags.nth(2).boundingBox();
      assert.ok(Math.abs(moved.y - (box.y + 60)) < 6, `line stays where it was dropped (${moved.y} vs ${box.y + 60})`);

      // Double-click puts it back.
      await tags.nth(2).dblclick();
      await until(async () => (await stored()) === undefined, 'the start is reset');

      await prompter.bringToFront();
      await prompter.keyboard.press('l');
      await until(async () => (await site.locator('pagecue-sections').count()) === 0, 'lines hidden');
    });

    await step('N adds a cue at the reading line; the page button does too; a cue can be deleted', async () => {
      await follow(`${origin}/report.html`);
      await until(async () => (await cardTitles()).length === 4, 'report cues');
      await site.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
      await new Promise((r) => setTimeout(r, 300));
      await prompter.bringToFront();
      await prompter.keyboard.press('n');
      const title = prompter.locator('.cue.is-editing textarea.cue-title');
      await title.waitFor();
      await title.fill('Added by hand');
      await title.press('Meta+Enter');
      await until(async () => (await cardTitles()).includes('Added by hand'), 'new cue saved');
      assert.equal((await cardTitles()).length, 5);
      // The new cue is current: it starts at the reading line.
      await until(async () => (await activeTitle()) === 'Added by hand', 'new cue is current');

      // From the page: the button on the reading line.
      await prompter.keyboard.press('l');
      await site.evaluate(() => scrollBy(0, 300));
      await site.locator('pagecue-sections .add').click();
      await prompter.locator('.cue.is-editing textarea.cue-title').waitFor();
      await until(async () => (await cardTitles()).length === 6, 'second added cue');
      await prompter.locator('.cue.is-editing').getByRole('button', { name: 'Delete cue' }).click();
      await until(async () => (await cardTitles()).length === 5, 'deleted');
      await prompter.locator('.toast').getByRole('button', { name: 'Undo' }).click();
      await until(async () => (await cardTitles()).length === 6, 'undo brings it back');

      // Double-clicking empty space in the prompter adds one too.
      await prompter.locator('.add-hint').dblclick();
      await prompter.locator('.cue.is-editing textarea.cue-title').waitFor();
      await until(async () => (await cardTitles()).length === 7, 'added by double-click');
      await prompter.keyboard.press('l');
    });

    await step('the A buttons change the text size and stop at the ends', async () => {
      const scale = () =>
        prompter.evaluate(() => getComputedStyle(document.querySelector('.app')).getPropertyValue('--scale'));
      const larger = prompter.getByRole('button', { name: 'Larger text' });
      const smaller = prompter.getByRole('button', { name: 'Smaller text' });
      await prompter.mouse.move(100, 300);
      const before = Number(await scale());
      await larger.click();
      await until(async () => Number(await scale()) > before, 'text got larger');
      while (await larger.isEnabled()) await larger.click();
      assert.equal(Number(await scale()), 1.3);
      while (await smaller.isEnabled()) await smaller.click();
      assert.equal(Number(await scale()), 0.88);
      await larger.click();
    });

    console.log('\nClaude Code (MCP) operating the prompter');

    await step('Claude sees the page and its cues, and adds, edits, shows and removes cues', async () => {
      const mcp = startMcp(mkdtempSync(join(tmpdir(), 'pagecue-mcp-')));
      try {
        const init = await mcp.request('initialize', { protocolVersion: '2025-06-18' });
        assert.match(init.result.instructions, /pagecue_status/);
        const tools = (await mcp.request('tools/list', {})).result.tools.map((tool) => tool.name);
        for (const name of [
          'pagecue_status',
          'add_cue',
          'edit_cue',
          'remove_cue',
          'show_cue',
          'set_view',
          'open_page',
        ]) {
          assert.ok(tools.includes(name), `tool ${name}`);
        }
        await follow(`${origin}/report.html`);
        await until(async () => /report\.html/.test((await mcp.tool('pagecue_status')).text), 'status shows the page');
        const status = (await mcp.tool('pagecue_status')).text;
        assert.match(status, /1\. Revenue/);
        assert.match(status, /▶/);

        const added = await mcp.tool('add_cue', {
          title: 'Risks: two to watch',
          notes: ['Supplier delay', 'FX'],
          near: 'Risks',
        });
        assert.equal(added.error, false, added.text);
        await until(async () => (await cardTitles()).includes('Risks: two to watch'), 'cue added by Claude');
        await prompter.locator('.toast', { hasText: 'Added by Claude' }).waitFor();
        const { number } = JSON.parse(added.text);
        await mcp.tool('edit_cue', { cue: number, title: 'Risks: supplier and FX' });
        await until(async () => (await cardTitles()).includes('Risks: supplier and FX'), 'edited by Claude');
        await mcp.tool('show_cue', { cue: number });
        await until(async () => (await activeTitle()) === 'Risks: supplier and FX', 'Claude moved to the cue');
        await until(
          async () => /▶ \d+\. Risks: supplier and FX/.test((await mcp.tool('pagecue_status')).text),
          'status knows the current cue',
        );
        await mcp.tool('remove_cue', { cue: number });
        await until(async () => !(await cardTitles()).includes('Risks: supplier and FX'), 'removed by Claude');
        await prompter
          .locator('.toast', { hasText: 'Deleted by Claude' })
          .getByRole('button', { name: 'Undo' })
          .click();
        await until(async () => (await cardTitles()).includes('Risks: supplier and FX'), 'undo brings it back');
        await mcp.tool('remove_cue', { cue: number });
        await until(async () => !(await cardTitles()).includes('Risks: supplier and FX'), 'removed again');
        const missing = await mcp.tool('add_cue', { title: 'x', near: 'no such words anywhere' });
        assert.equal(missing.error, true);
        assert.match(missing.text, /No visible text/);
        assert.equal(await site.evaluate(() => typeof window.pagecue), 'undefined', 'nothing added to the page');

        await mcp.tool('set_view', { section_lines: true, text_size: 'L' });
        await until(
          async () => (await site.locator('pagecue-sections .tag').count()) > 0,
          'Claude turned section lines on',
        );
        await mcp.tool('set_view', { section_lines: false, text_size: 'M' });
        await until(async () => (await site.locator('pagecue-sections').count()) === 0, 'and off');

        await mcp.tool('open_page', { url: `${origin}/dashboard.html` });
        await until(
          async () => /dashboard\.html/.test((await mcp.tool('pagecue_status')).text),
          'Claude opened another page',
        );
        await until(
          async () => (await cardTitles()).join() === 'Metric 3 is up 21%,Metric 8 needs attention',
          'prompter follows it',
        );
      } finally {
        mcp.stop();
      }
    });

    if (process.env.PAGECUE_SCREENSHOTS) {
      const shots = process.env.PAGECUE_SCREENSHOTS;
      await follow(`${origin}/blank.html`);
      await prompter
        .locator('.prompt-card')
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
      await prompter.screenshot({ path: join(shots, 'prompter-empty.png') });
      await prompter.keyboard.press('s');
      await prompter.locator('.sheet').waitFor();
      await new Promise((r) => setTimeout(r, 300));
      await prompter.locator('.site-row').first().hover();
      await prompter.screenshot({ path: join(shots, 'prompter-sites.png') });
    }

    console.log(`\nAll ${steps.length} end-to-end checks passed.`);
  } finally {
    await context.close();
    server.close();
    frameServer.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
