import { normalizeText } from './text';
import type { Anchor, Cue } from './types';

/**
 * The pagecue cue file (format version 1): how a site ships its own cues, and how cues are exported.
 *
 * ```json
 * {
 *   "pagecue": 1,
 *   "cues": [
 *     { "id": "revenue", "title": "Revenue doubled in Q3", "notes": ["New EU customers", "Ask: churn?"] }
 *   ]
 * }
 * ```
 *
 * `anchor` may be omitted (the cue attaches to the element with `data-pagecue="<id>"`), a string
 * (another `data-pagecue` value), or a full anchor object as exported by the extension. Instead of
 * an anchor, `near` gives the exact visible text where the cue starts (usually a heading), for pages
 * whose source cannot be marked.
 * The JSON Schema lives in `plugins/pagecue/schema/pagecue.schema.json` at the repository root.
 */
export const CUE_FILE_VERSION = 1;

/** MIME type for `<link rel="alternate">` and inline `<script>` cue files. */
export const CUE_FILE_TYPE = 'application/vnd.pagecue+json';

export interface CueFileEntry {
  id: string;
  anchor?: string | Anchor;
  /** Exact visible text where the cue starts, usually a heading. Used when there is no `anchor`. */
  near?: string;
  title: string;
  notes?: string | string[];
  /** Where the cue starts, moved by a share of its section's height (see `Cue.startAt`). */
  startAt?: number;
}

export interface CueFile {
  pagecue: typeof CUE_FILE_VERSION;
  title?: string;
  cues: CueFileEntry[];
}

export class CueFileError extends Error {
  override name = 'CueFileError';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseAnchor(value: unknown, near: unknown, id: string, where: string): Anchor {
  if (value === undefined && near !== undefined) {
    if (typeof near !== 'string' || !normalizeText(near)) throw new CueFileError(`${where}: "near" must be text.`);
    const text = normalizeText(near);
    return { tag: '*', text, heading: text };
  }
  if (value === undefined) return { cue: id, tag: '*' };
  if (typeof value === 'string' && value.trim()) return { cue: value.trim(), tag: '*' };
  if (isRecord(value) && typeof value.tag === 'string') {
    const anchor: Anchor = { tag: value.tag };
    for (const key of ['cue', 'id', 'selector', 'text', 'heading'] as const) {
      if (typeof value[key] === 'string') anchor[key] = value[key];
    }
    const testId = value.testId;
    if (isRecord(testId) && typeof testId.attr === 'string' && typeof testId.value === 'string') {
      anchor.testId = { attr: testId.attr, value: testId.value };
    }
    return anchor;
  }
  throw new CueFileError(`${where}: "anchor" must be a data-pagecue value or an anchor object with a "tag".`);
}

function parseNotes(value: unknown, where: string): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((line) => typeof line === 'string')) return value.join('\n');
  throw new CueFileError(`${where}: "notes" must be a string or an array of strings.`);
}

/**
 * Validates a parsed cue file and turns it into cues. Throws `CueFileError` with a message that
 * names the offending cue, so an agent or a person can fix the file.
 */
export function parseCueFile(input: unknown, now = Date.now()): Cue[] {
  if (!isRecord(input)) throw new CueFileError('A cue file must be a JSON object.');
  if (input.pagecue !== CUE_FILE_VERSION) {
    throw new CueFileError(`Unsupported cue file: expected "pagecue": ${CUE_FILE_VERSION}.`);
  }
  if (!Array.isArray(input.cues)) throw new CueFileError('A cue file needs a "cues" array.');

  const seen = new Set<string>();
  return input.cues.map((entry, position) => {
    const where = `cues[${position}]`;
    if (!isRecord(entry)) throw new CueFileError(`${where} must be an object.`);
    const { id, title } = entry;
    if (typeof id !== 'string' || !id.trim()) throw new CueFileError(`${where} needs a non-empty "id".`);
    if (seen.has(id)) throw new CueFileError(`${where}: duplicate id "${id}".`);
    seen.add(id);
    if (typeof title !== 'string') throw new CueFileError(`${where} ("${id}") needs a "title".`);
    const { startAt } = entry;
    if (startAt !== undefined && (typeof startAt !== 'number' || !Number.isFinite(startAt))) {
      throw new CueFileError(`${where} ("${id}"): "startAt" must be a number.`);
    }

    return {
      id,
      anchor: parseAnchor(entry.anchor, entry.near, id, `${where} ("${id}")`),
      title,
      notes: parseNotes(entry.notes, `${where} ("${id}")`),
      ...(startAt ? { startAt } : {}),
      origin: 'site',
      createdAt: now,
      updatedAt: now,
    } satisfies Cue;
  });
}

/** Exports cues in the cue file format, with full anchors so they work on any copy of the page. */
export function toCueFile(cues: readonly Cue[], title?: string): CueFile {
  return {
    pagecue: CUE_FILE_VERSION,
    ...(title ? { title } : {}),
    cues: cues.map((cue) => ({
      id: cue.id,
      anchor: cue.anchor,
      title: cue.title,
      notes: cue.notes.split('\n').filter((line) => line.trim()),
      ...(cue.startAt ? { startAt: cue.startAt } : {}),
    })),
  };
}

/**
 * Merges the cues a site ships into the cues stored for it.
 * - A site cue replaces the stored copy, unless that copy was edited here.
 * - Cues written in the prompter, and site cues edited here, are never touched.
 * - `present` lists every id the site currently declares. A stored site cue missing from it is
 *   dropped; pass `null` when the site's full list is not known (for example the cue file failed
 *   to load, or only part of a single-page app has rendered), and nothing is dropped.
 */
export function mergeSiteCues(
  stored: readonly Cue[],
  fromSite: readonly Cue[],
  present: ReadonlySet<string> | null = new Set(fromSite.map((cue) => cue.id)),
): Cue[] {
  const incoming = new Map(fromSite.map((cue) => [cue.id, cue]));
  const result: Cue[] = [];

  for (const cue of stored) {
    if (cue.origin === 'local' || cue.editedLocally) {
      result.push(cue);
      incoming.delete(cue.id);
      continue;
    }
    const next = incoming.get(cue.id);
    if (next) {
      const changed =
        next.title !== cue.title ||
        next.notes !== cue.notes ||
        (next.startAt ?? 0) !== (cue.startAt ?? 0) ||
        JSON.stringify(next.anchor) !== JSON.stringify(cue.anchor);
      result.push(changed ? { ...next, createdAt: cue.createdAt } : cue);
      incoming.delete(cue.id);
    } else if (present === null || present.has(cue.id)) {
      result.push(cue);
    }
  }
  result.push(...incoming.values());
  return result;
}
