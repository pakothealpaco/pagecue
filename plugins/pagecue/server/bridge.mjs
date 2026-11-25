#!/usr/bin/env node
// pagecue bridge: connects an agent (Claude Code) with the pagecue Chrome extension, with no manual step.
// It hands over whole cue files, and while the prompter is open it is a live link both ways: the
// prompter reports which page it follows and its cues, and the agent sends it commands (add a cue
// here, edit, delete, show, section lines, pause, text size, theme, open a page).
//
//   node bridge.mjs publish <page-url> <cues.json>   store cues for a page (starts the server if needed)
//   node bridge.mjs serve                           run the local server in the foreground
//   node bridge.mjs mcp                             MCP server on stdio (used by the Claude Code plugin)
//
// Cues are stored in ~/.pagecue/inbox and the live link in ~/.pagecue/live (PAGECUE_HOME overrides
// ~/.pagecue). A small HTTP server on 127.0.0.1:47613 (PAGECUE_PORT overrides) talks to the extension.
// Responses carry CORS headers only for chrome-extension:// origins, so web pages cannot read them,
// and writes need a custom header, which a web page cannot send without a CORS preflight that only
// extensions pass. No dependencies.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const PORT = Number(process.env.PAGECUE_PORT ?? 47613);
const HOME = process.env.PAGECUE_HOME ?? join(homedir(), '.pagecue');
const INBOX = join(HOME, 'inbox');
const LIVE = join(HOME, 'live');
const COMMANDS = join(LIVE, 'commands');
const RESULTS = join(LIVE, 'results');
/** The prompter reports about once a second; older state means it is closed. */
const STATE_FRESH_MS = 6000;
/** How long an agent waits for the prompter to carry out a command. */
const COMMAND_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_000_000;
const VERSION = '0.2.0';
/** A server started by `publish` exits after this long without requests. */
const IDLE_EXIT_MS = 4 * 60 * 60 * 1000;

// ---------------------------------------------------------------- site keys
// Must match extension/src/lib/siteKey.ts; a test compares the two.

const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|ref|ref_src)$/i;

export function siteKey(input) {
  const url = new URL(input);
  if (url.protocol === 'file:') return `file://${decodeURI(url.pathname)}`;
  let path = url.pathname.replace(/\/index\.html?$/i, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_PARAMS.test(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  const hash = /^#!?\//.test(url.hash) ? url.hash : '';
  return `${url.origin}${path}${query}${hash}`;
}

// ---------------------------------------------------------------- inbox

const entryPath = (key) => join(INBOX, `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.json`);

/** Light validation; the extension validates fully and reports problems in the prompter. */
function checkCueFile(file) {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) throw new Error('The cue file must be a JSON object.');
  if (file.pagecue !== 1) throw new Error('The cue file needs "pagecue": 1.');
  if (!Array.isArray(file.cues) || file.cues.length === 0) throw new Error('The cue file needs a non-empty "cues" array.');
  for (const [index, cue] of file.cues.entries()) {
    if (typeof cue?.id !== 'string' || !cue.id) throw new Error(`cues[${index}] needs an "id".`);
    if (typeof cue.title !== 'string') throw new Error(`cues[${index}] ("${cue.id}") needs a "title".`);
  }
}

export function publish(url, cueFile) {
  const key = siteKey(url);
  checkCueFile(cueFile);
  mkdirSync(INBOX, { recursive: true });
  const entry = { key, url, publishedAt: Date.now(), cueFile };
  const path = entryPath(key);
  writeFileSync(`${path}.tmp`, JSON.stringify(entry));
  renameSync(`${path}.tmp`, path);
  return entry;
}

export function lookup(key) {
  const path = entryPath(key);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

export function listPublished() {
  if (!existsSync(INBOX)) return [];
  return readdirSync(INBOX)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(INBOX, name), 'utf8')))
    .map(({ key, url, publishedAt, cueFile }) => ({ key, url, publishedAt, cues: cueFile.cues.length }));
}

// ---------------------------------------------------------------- live link with the open prompter

function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value));
  renameSync(`${path}.tmp`, path);
}

/** The prompter's latest report: page, cues, current cue, view. Kept in a file so every bridge process sees it. */
export function writeState(state) {
  mkdirSync(LIVE, { recursive: true });
  writeJson(join(LIVE, 'state.json'), { ...state, receivedAt: Date.now() });
}

/** The prompter's latest report, or null when no prompter has reported in the last few seconds. */
export function readState() {
  const path = join(LIVE, 'state.json');
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, 'utf8'));
  return Date.now() - state.receivedAt < STATE_FRESH_MS ? state : null;
}

let sequence = 0;

/** Queues a command for the prompter and returns its id. */
export function queueCommand(command, args = {}) {
  mkdirSync(COMMANDS, { recursive: true });
  const id = randomUUID();
  // `seq` keeps the order of commands queued in the same millisecond.
  writeJson(join(COMMANDS, `${id}.json`), { id, command, args, at: Date.now(), seq: (sequence += 1) });
  return id;
}

/** Hands the queued commands to the prompter, oldest first, and removes them from the queue. */
export function takeCommands() {
  if (!existsSync(COMMANDS)) return [];
  const commands = [];
  for (const name of readdirSync(COMMANDS).filter((file) => file.endsWith('.json'))) {
    const path = join(COMMANDS, name);
    try {
      const command = JSON.parse(readFileSync(path, 'utf8'));
      rmSync(path, { force: true });
      if (Date.now() - command.at < COMMAND_TIMEOUT_MS) commands.push(command);
    } catch {
      rmSync(path, { force: true });
    }
  }
  return commands.sort((a, b) => a.at - b.at || (a.seq ?? 0) - (b.seq ?? 0));
}

export function writeResult(result) {
  if (typeof result?.id !== 'string' || !/^[\w-]+$/.test(result.id)) return;
  mkdirSync(RESULTS, { recursive: true });
  writeJson(join(RESULTS, `${result.id}.json`), result);
}

/** Sends a command to the open prompter and waits for what it did. */
export async function runCommand(command, args = {}, timeoutMs = COMMAND_TIMEOUT_MS) {
  if (!readState()) {
    throw new Error(
      'The pagecue prompter is not open. Ask the presenter to open the page in Chrome and click the pagecue button in the toolbar (or press Alt+Shift+P), then try again.',
    );
  }
  const id = queueCommand(command, args);
  const path = join(RESULTS, `${id}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const result = JSON.parse(readFileSync(path, 'utf8'));
      rmSync(path, { force: true });
      if (!result.ok) throw new Error(result.error || 'The prompter could not do that.');
      return result.result;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  rmSync(join(COMMANDS, `${id}.json`), { force: true });
  throw new Error('The pagecue prompter did not answer in time. Is it still open and connected to the page?');
}

// ---------------------------------------------------------------- HTTP server for the extension

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** Starts the server; resolves false when another bridge already holds the port (it serves the same inbox). */
export function serve({ exitWhenIdle = false } = {}) {
  let idleTimer;
  const touch = () => {
    if (!exitWhenIdle) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => process.exit(0), IDLE_EXIT_MS);
    idleTimer.unref?.();
  };
  const server = createServer((req, res) => {
    touch();
    const origin = req.headers.origin ?? '';
    // Only extensions may read responses; a web page gets no CORS header and cannot see the data.
    if (origin.startsWith('chrome-extension://')) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const fromExtension = origin.startsWith('chrome-extension://');
    if (req.method === 'OPTIONS') {
      if (fromExtension) {
        res.setHeader('access-control-allow-methods', 'GET, POST');
        res.setHeader('access-control-allow-headers', 'content-type, x-pagecue');
        res.setHeader('access-control-max-age', '600');
      }
      return res.writeHead(204).end();
    }
    if (req.method === 'POST' && url.pathname === '/v1/quit') {
      // A newer bridge asks an older one to make way. Browsers always send an Origin on POST, so
      // only a local program (another bridge) gets here.
      if (origin || req.headers['x-pagecue'] !== '1') return res.writeHead(403).end();
      res.writeHead(204).end();
      server.close();
      setTimeout(() => process.exit(0), 50);
      return;
    }
    if (req.method === 'POST') {
      // Only the extension writes: it sends a header a web page could only send after a preflight,
      // and the preflight is answered for extension origins alone.
      if (!fromExtension || req.headers['x-pagecue'] !== '1') return res.writeHead(403).end();
      readBody(req).then(
        (body) => {
          if (url.pathname === '/v1/state') {
            writeState(body);
            res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ commands: takeCommands() }));
          } else if (url.pathname === '/v1/results') {
            writeResult(body);
            res.writeHead(204).end();
          } else {
            res.writeHead(404).end();
          }
        },
        () => res.writeHead(400).end(),
      );
      return;
    }
    if (req.method !== 'GET') return res.writeHead(405).end();
    if (url.pathname === '/v1/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ pagecue: VERSION }));
    } else if (url.pathname === '/v1/cues') {
      const entry = lookup(url.searchParams.get('key') ?? '');
      if (!entry) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(entry));
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((done) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') done(false);
      else throw error;
    });
    server.listen(PORT, '127.0.0.1', () => {
      touch();
      done(true);
    });
  });
}

/** The version of the bridge on the port, or null when none answers. */
async function runningVersion() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/v1/health`, { signal: AbortSignal.timeout(800) });
    return response.ok ? ((await response.json()).pagecue ?? 'unknown') : null;
  } catch {
    return null;
  }
}

async function serverRunning() {
  return (await runningVersion()) === VERSION;
}

/** Asks an older bridge on the port to exit, so this version can serve. */
async function replaceOlderBridge() {
  const version = await runningVersion();
  if (version === null || version === VERSION) return;
  await fetch(`http://127.0.0.1:${PORT}/v1/quit`, { method: 'POST', headers: { 'x-pagecue': '1' } }).catch(() => undefined);
  for (let i = 0; i < 20 && (await runningVersion()) !== null; i += 1) await new Promise((r) => setTimeout(r, 50));
}

/** Makes sure a server is up, starting a detached one that outlives this command. */
async function ensureServer() {
  if (await serverRunning()) return 'running';
  await replaceOlderBridge();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--exit-when-idle'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 20; i += 1) {
    if (await serverRunning()) return 'started';
    await new Promise((r) => setTimeout(r, 100));
  }
  return 'unavailable';
}

// ---------------------------------------------------------------- MCP (stdio JSON-RPC)

const CUE_REF = {
  description: 'The cue: its number as pagecue_status lists it (1 is the first), or its id.',
  oneOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }],
};

const NOTES = {
  type: 'array',
  items: { type: 'string' },
  description: 'At most three short points, each a phrase of about twelve words. Only facts from the page or the presenter.',
};

const INSTRUCTIONS = `pagecue is a Chrome extension: a private prompter window shows the presenter short cues (a headline and up to three points) for the part of a web page on screen while they present it in Zoom, Meet or Teams. Each cue covers a horizontal part of the page, from where it starts down to where the next cue starts; one cue is current at a time, the one at the reading line (a third of the way down the window).

While the prompter is open you can operate it for the presenter. Call pagecue_status first: it tells you the page, every cue in order (with the presenter's own edits) and which cue is current. "Here" or "this part" means the current cue or the reading line. Then add_cue, edit_cue, remove_cue and show_cue change cues on that page; set_view turns section lines on the page on or off, pauses following, and sets text size and theme; open_page moves the presenter to another page. Changes appear in the prompter at once, each with Undo for the presenter. Write cues in the language the presenter speaks to you, unless they ask for another one. To write a whole set of cues for a page, use the add-cues skill and publish_cues.`;

const TOOLS = [
  {
    name: 'pagecue_status',
    description:
      'Start here. Whether the pagecue prompter is open, which page it follows (URL and title), every cue on that page in order (number, id, title, points, including the presenter’s edits), which cue is current (where the presenter is now), and the view (section lines, paused, text size, theme).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_cue',
    description:
      'Add a cue to the page the prompter is on; it appears in the prompter at once. With near, the cue starts at that text on the page; without it, it starts at the reading line, where the presenter is now ("add a cue here"). When the presenter sends a screenshot, pass the exact text of the heading in it as near.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: {
          type: 'string',
          description: 'The point to make, as a headline of about eight words, in the presenter’s language.',
        },
        notes: NOTES,
        near: {
          type: 'string',
          description: 'Exact visible text on the page (a heading, or the start of a paragraph) where the cue should start.',
        },
      },
    },
  },
  {
    name: 'edit_cue',
    description: 'Change a cue’s headline or points. Give only what changes; notes replaces all the points.',
    inputSchema: {
      type: 'object',
      required: ['cue'],
      properties: { cue: CUE_REF, title: { type: 'string' }, notes: NOTES },
    },
  },
  {
    name: 'remove_cue',
    description: 'Delete a cue. The presenter can undo it in the prompter.',
    inputSchema: { type: 'object', required: ['cue'], properties: { cue: CUE_REF } },
  },
  {
    name: 'show_cue',
    description: 'Scroll the page (and the prompter) to a cue, so it is the current one.',
    inputSchema: { type: 'object', required: ['cue'], properties: { cue: CUE_REF } },
  },
  {
    name: 'set_view',
    description:
      'Change how the prompter works. section_lines draws where each cue starts on the page itself (viewers of a shared tab see them, so turn them off before presenting). paused stops the prompter following the page. text_size and theme change the prompter window.',
    inputSchema: {
      type: 'object',
      properties: {
        section_lines: { type: 'boolean' },
        paused: { type: 'boolean' },
        text_size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
        theme: { type: 'string', enum: ['system', 'dark', 'light'] },
      },
    },
  },
  {
    name: 'open_page',
    description:
      'Open a page in Chrome (or go to its tab if it is open) and make the prompter follow it. On a site pagecue may not reach yet, the presenter has to click the pagecue button there once.',
    inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  },
  {
    name: 'publish_cues',
    description:
      'Send a whole set of presenter cues for a web page to the pagecue Chrome extension. The prompter shows them within seconds, with no import step. Use after writing a cue file with the add-cues skill.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'The page URL exactly as the presenter opens it (http, https or file://).' },
        cues_path: { type: 'string', description: 'Absolute path of a pagecue cue file (JSON).' },
        cues: { type: 'object', description: 'The cue file object itself, instead of cues_path.' },
      },
    },
  },
  {
    name: 'list_published_cues',
    description: 'List the pages that have cues published to the pagecue extension.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const LIVE_COMMANDS = new Set(['add_cue', 'edit_cue', 'remove_cue', 'show_cue', 'set_view', 'open_page']);

function describeState(state) {
  if (!state) {
    return 'The pagecue prompter is not open. Ask the presenter to open the page in Chrome and click the pagecue button in the toolbar (or press Alt+Shift+P).';
  }
  const lines = [];
  if (!state.page) lines.push(`The prompter is open but not following a page (${state.status ?? 'idle'}).`);
  else {
    lines.push(`Page: ${state.page.title}`, `URL: ${state.page.url}`, `Connection: ${state.status}`);
    lines.push(
      `View: section lines ${state.view?.sectionLines ? 'on' : 'off'}, ${state.view?.paused ? 'paused' : 'following the page'}, text size ${state.view?.textSize}, theme ${state.view?.theme}.`,
    );
    if (!state.cues?.length) lines.push('No cues on this page yet.');
    else {
      lines.push('', `Cues (${state.cues.length}); the current one is marked with ▶:`);
      for (const cue of state.cues) {
        lines.push(`${cue.number === state.current ? '▶' : ' '} ${cue.number}. ${cue.title || '(no headline)'}  [id ${cue.id}]`);
        for (const point of cue.notes) lines.push(`      - ${point}`);
      }
    }
  }
  return lines.join('\n');
}

async function runTool(name, args) {
  if (name === 'pagecue_status') return describeState(readState());
  if (LIVE_COMMANDS.has(name)) {
    const result = await runCommand(name, args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }
  if (name === 'publish_cues') {
    const file = args.cues ?? JSON.parse(readFileSync(resolve(String(args.cues_path)), 'utf8'));
    const entry = publish(String(args.url), file);
    return `Published ${entry.cueFile.cues.length} cues for ${entry.url}. If the page is open with the pagecue prompter, they appear within a few seconds; otherwise they load the next time the presenter opens pagecue on that page.`;
  }
  if (name === 'list_published_cues') {
    const items = listPublished();
    return items.length ? items.map((item) => `${item.url} (${item.cues} cues)`).join('\n') : 'No cues published yet.';
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function mcp() {
  await replaceOlderBridge();
  await serve();
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    const { id, method, params } = message;
    if (id === undefined) continue; // notifications need no reply
    try {
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'pagecue', version: VERSION },
            instructions: INSTRUCTIONS,
          },
        });
      } else if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      } else if (method === 'tools/call') {
        // Not awaited: a command waiting on the prompter must not hold up other requests.
        runTool(params.name, params.arguments ?? {}).then(
          (text) => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }),
          (error) =>
            send({
              jsonrpc: '2.0',
              id,
              result: { content: [{ type: 'text', text: String(error.message ?? error) }], isError: true },
            }),
        );
      } else if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
    } catch (error) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(error) } });
    }
  }
  // Claude Code closed the session; a detached `publish` server keeps serving if one is running.
  // Let replies to commands still in flight go out first.
  setTimeout(() => process.exit(0), 200);
}

// ---------------------------------------------------------------- command line

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'publish') {
    const [url, path] = rest;
    if (!url || !path) {
      console.error('Usage: node bridge.mjs publish <page-url> <cues.json>');
      process.exit(2);
    }
    const entry = publish(url, JSON.parse(readFileSync(resolve(path), 'utf8')));
    const server = await ensureServer();
    console.log(`✓ Published ${entry.cueFile.cues.length} cues for ${entry.key}`);
    if (server === 'unavailable') {
      console.log(`! The local bridge could not start on port ${PORT}; the extension will not see these cues until it runs.`);
    } else {
      console.log('  If the page is open with the pagecue prompter, the cues appear within a few seconds.');
    }
  } else if (command === 'serve') {
    await replaceOlderBridge();
    const started = await serve({ exitWhenIdle: rest.includes('--exit-when-idle') });
    if (!started) {
      console.log(`A pagecue bridge is already running on port ${PORT}.`);
      process.exit(0);
    }
    console.log(`pagecue bridge on http://127.0.0.1:${PORT} (inbox ${INBOX})`);
  } else if (command === 'mcp') {
    await mcp();
  } else if (command === 'status') {
    console.log(describeState(readState()));
  } else if (command === 'list') {
    for (const item of listPublished()) console.log(`${item.url}  (${item.cues} cues)`);
  } else {
    console.error('Usage: node bridge.mjs publish <page-url> <cues.json> | serve | mcp | list');
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`✗ ${error.message ?? error}`);
    process.exit(1);
  });
}
