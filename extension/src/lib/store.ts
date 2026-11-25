import { browser } from 'wxt/browser';
import { applyCueChange, type CueChange } from './cueChange';
import type { SiteRecord } from './types';

/**
 * The local cue database: one `chrome.storage.local` entry per site key.
 * The manifest requests `unlimitedStorage`, so the 10 MB default quota does not apply.
 * Nothing leaves the machine unless the user exports it.
 *
 * Reads happen anywhere. Writes go through the background worker (`requestChange`), which applies
 * them one after another for each site. Without that, the page importing a site's cue file and
 * the presenter typing in the prompter could both read, change and write the same record, and the
 * later write would silently drop the earlier one.
 */
const PREFIX = 'site:';

const storageKey = (key: string): string => `${PREFIX}${key}`;

export interface PageInfo {
  title: string;
  url: string;
}

export interface ChangeRequest {
  type: 'cue-change';
  key: string;
  page: PageInfo;
  change: CueChange;
}

export interface RenameRequest {
  type: 'site-rename';
  key: string;
  /** An empty name goes back to the page title. */
  name: string;
}

const ALIAS_PREFIX = 'alias:';

/**
 * The page an address belongs to. Some pages put the section you scroll to in their address
 * (`/api` becomes `/api/errors`); pagecue keeps presenting the page it started on and remembers the
 * other address as an alias, so a reload there finds the same cues.
 */
export async function pageKeyFor(key: string): Promise<string> {
  const entry = await browser.storage.local.get(`${ALIAS_PREFIX}${key}`);
  const target = entry[`${ALIAS_PREFIX}${key}`];
  return typeof target === 'string' && target !== key ? target : key;
}

export async function setAlias(from: string, to: string): Promise<void> {
  if (from === to) return;
  await browser.storage.local.set({ [`${ALIAS_PREFIX}${from}`]: to });
}

export async function getSite(key: string): Promise<SiteRecord | undefined> {
  const entry = await browser.storage.local.get(storageKey(key));
  return entry[storageKey(key)] as SiteRecord | undefined;
}

export async function listSites(): Promise<SiteRecord[]> {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([name]) => name.startsWith(PREFIX))
    .map(([, value]) => value as SiteRecord)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSite(key: string): Promise<void> {
  await browser.storage.local.remove(storageKey(key));
}

/** Asks the background worker to apply a change to a site's cues. Resolves once it is stored. */
export async function requestChange(key: string, page: PageInfo, change: CueChange): Promise<void> {
  const request: ChangeRequest = { type: 'cue-change', key, page, change };
  await browser.runtime.sendMessage(request);
}

/** Asks the background worker to rename a site. Resolves once it is stored. */
export async function requestRename(key: string, name: string): Promise<void> {
  const request: RenameRequest = { type: 'site-rename', key, name };
  await browser.runtime.sendMessage(request);
}

const queues = new Map<string, Promise<unknown>>();

/** Runs writes to one site strictly in order; a failed write does not block the ones after it. */
function enqueue<T>(key: string, write: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

/** Applies a change in the background worker. */
export function commitChange({ key, page, change }: ChangeRequest): Promise<SiteRecord> {
  return enqueue(key, async () => {
    const current = await getSite(key);
    const record: SiteRecord = {
      key,
      title: page.title || current?.title || key,
      url: page.url || current?.url || key,
      ...(current?.name ? { name: current.name } : {}),
      cues: applyCueChange(current?.cues ?? [], change),
      updatedAt: Date.now(),
    };
    await browser.storage.local.set({ [storageKey(key)]: record });
    return record;
  });
}

/** Renames a site in the background worker; a site with no record yet is left alone. */
export function commitRename({ key, name }: RenameRequest): Promise<SiteRecord | undefined> {
  return enqueue(key, async () => {
    const current = await getSite(key);
    if (!current) return undefined;
    const rest: SiteRecord = { ...current };
    delete rest.name;
    const trimmed = name.trim();
    const record: SiteRecord = trimmed && trimmed !== current.title ? { ...rest, name: trimmed } : rest;
    await browser.storage.local.set({ [storageKey(key)]: record });
    return record;
  });
}

/**
 * A page title without the site's name tacked on ("Women's accessories | SHOP" → "Women's
 * accessories"): of the parts between separators, the longest, which is usually the page's own.
 */
export function shortTitle(title: string): string {
  const parts = title
    .split(/\s+[|·•–—-]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.reduce((a, b) => (b.length > a.length ? b : a)) : title.trim();
}

/** The name to show for a site: the presenter's own, else the short page title. */
export const siteName = (site: Pick<SiteRecord, 'name' | 'title'>): string => site.name || shortTitle(site.title);

/** Calls `listener` whenever the record for `key` changes, from any extension context. */
export function watchSite(key: string, listener: (record: SiteRecord | undefined) => void): () => void {
  const name = storageKey(key);
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
    if (area === 'local' && name in changes) listener(changes[name]!.newValue as SiteRecord | undefined);
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

/** Calls `listener` when any site record is added, changed or removed. */
export function watchLibrary(listener: () => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area === 'local' && Object.keys(changes).some((name) => name.startsWith(PREFIX))) listener();
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

export function newCueId(): string {
  return `cue-${crypto.randomUUID().slice(0, 8)}`;
}
