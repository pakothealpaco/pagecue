import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { siteKey } from '../src/lib/siteKey';

// The bridge ships with the Claude Code plugin as plain JavaScript; it must agree with the extension.
type Bridge = {
  writeState: (state: unknown) => void;
  readState: () => { page?: { url: string } } | null;
  queueCommand: (command: string, args?: unknown) => string;
  takeCommands: () => { id: string; command: string; args: unknown }[];
  writeResult: (result: { id: string; ok: boolean; result?: unknown; error?: string }) => void;
  runCommand: (command: string, args?: unknown, timeoutMs?: number) => Promise<unknown>;
  siteKey: (url: string) => string;
  publish: (url: string, file: unknown) => { key: string };
  lookup: (key: string) => { url: string; cueFile: { cues: unknown[] } } | null;
};
let bridge: Bridge;

beforeAll(async () => {
  process.env.PAGECUE_HOME = mkdtempSync(join(tmpdir(), 'pagecue-bridge-'));
  bridge = (await import(
    /* @vite-ignore */ pathToFileURL(resolve(__dirname, '../../plugins/pagecue/server/bridge.mjs')).href
  )) as Bridge;
});

const URLS = [
  'https://shop.example.co.il/product/משטח-טעינה/',
  'https://example.com/reports/index.html',
  'http://localhost:5173/?b=2&utm_source=x&a=1',
  'https://app.io/#/billing',
  'https://app.io/page#section',
  'file:///Users/me/report%20q3.html',
];

describe('bridge', () => {
  it('computes the same site keys as the extension', () => {
    for (const url of URLS) expect(bridge.siteKey(url)).toBe(siteKey(url));
  });

  it('stores published cues under the page key', () => {
    const file = { pagecue: 1, cues: [{ id: 'a', title: 'A' }] };
    const { key } = bridge.publish('https://example.com/r/?utm_source=mail', file);
    expect(key).toBe('https://example.com/r');
    expect(bridge.lookup(key)?.cueFile).toEqual(file);
    expect(bridge.lookup('https://example.com/other')).toBeNull();
  });

  it('refuses files that are not cue files', () => {
    expect(() => bridge.publish('https://example.com', { cues: [] })).toThrow(/pagecue/);
    expect(() => bridge.publish('https://example.com', { pagecue: 1, cues: [{ title: 'x' }] })).toThrow(/id/);
  });
});

describe('bridge live link', () => {
  it('refuses commands while no prompter reports', async () => {
    await expect(bridge.runCommand('show_cue', { cue: 1 }, 200)).rejects.toThrow(/prompter is not open/);
  });

  it('keeps the latest prompter state', () => {
    bridge.writeState({ page: { url: 'https://example.com/' } });
    expect(bridge.readState()?.page?.url).toBe('https://example.com/');
  });

  it('hands commands to the prompter once, oldest first', () => {
    const first = bridge.queueCommand('show_cue', { cue: 1 });
    const second = bridge.queueCommand('show_cue', { cue: 2 });
    expect(bridge.takeCommands().map((command) => command.id)).toEqual([first, second]);
    expect(bridge.takeCommands()).toEqual([]);
  });

  it('returns what the prompter answered, and its errors', async () => {
    bridge.writeState({ page: { url: 'https://example.com/' } });
    const answer = (ok: boolean) => {
      const timer = setInterval(() => {
        for (const command of bridge.takeCommands()) {
          bridge.writeResult({ id: command.id, ok, ...(ok ? { result: { number: 3 } } : { error: 'No cue 9.' }) });
          clearInterval(timer);
        }
      }, 20);
    };
    answer(true);
    await expect(bridge.runCommand('add_cue', { title: 'x' }, 2000)).resolves.toEqual({ number: 3 });
    answer(false);
    await expect(bridge.runCommand('remove_cue', { cue: 9 }, 2000)).rejects.toThrow('No cue 9.');
  });
});
