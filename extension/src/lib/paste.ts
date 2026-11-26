import { CueFileError, parseCueFile, type CueFileEntry } from './cueFile';
import { normalizeText } from './text';
import type { Cue } from './types';

/**
 * Cues pasted from any AI chat (or typed by hand). Two shapes are accepted, inside a code block or
 * not:
 *
 * - a pagecue cue file (JSON), also without `"pagecue": 1` or as a bare array of cues;
 * - plain text, one block per cue:
 *
 *   ```text
 *   ## Exact heading on the page
 *   Headline to say
 *   - a point
 *   - another point
 *   ```
 *
 * The `##` line is where the cue starts on the page (matched by text, like a cue file's `near`).
 * Throws `CueFileError` with a message a presenter can act on.
 */
export function parsePastedCues(input: string, now = Date.now()): Cue[] {
  const text = stripFences(input).trim();
  if (!text) throw new CueFileError('Nothing to add: paste the cues Claude wrote.');
  if (/^[[{]/.test(text)) return parseJson(text, now);
  return parseCueFile({ pagecue: 1, cues: parseText(text) }, now);
}

/** The contents of the first code block, or the whole text when there is none. */
function stripFences(input: string): string {
  const block = /```[^\n`]*\n([\s\S]*?)```/.exec(input);
  return block ? block[1]! : input;
}

function parseJson(text: string, now: number): Cue[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Chats sometimes leave a trailing comma; nothing else is repaired.
    try {
      value = JSON.parse(text.replace(/,\s*([\]}])/g, '$1'));
    } catch {
      throw new CueFileError('That looks like JSON but isn’t valid. Copy the whole block Claude wrote.');
    }
  }
  if (Array.isArray(value)) value = { pagecue: 1, cues: value };
  if (value && typeof value === 'object' && !('pagecue' in value) && 'cues' in value) {
    value = { pagecue: 1, ...value };
  }
  return parseCueFile(value, now);
}

const HEADING = /^#{1,6}\s+(.+)$/;
const POINT = /^(?:[-*•–]|\d+[.)])\s+(.+)$/;

function clean(line: string): string {
  return normalizeText(line.replace(/\*\*|__|`/g, '').replace(/^["“]|["”]$/g, ''));
}

function slug(value: string, taken: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'cue';
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function parseText(text: string): CueFileEntry[] {
  const cues: CueFileEntry[] = [];
  const ids = new Set<string>();
  let current: { near: string; title?: string; notes: string[] } | null = null;
  const finish = (): void => {
    if (!current) return;
    cues.push({
      id: slug(current.near, ids),
      near: current.near,
      title: current.title ?? current.near,
      notes: current.notes.slice(0, 6),
    });
    current = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      finish();
      current = { near: clean(heading[1]!), notes: [] };
      continue;
    }
    if (!current) continue; // text before the first heading (the chat's own introduction)
    const point = POINT.exec(line);
    if (point) current.notes.push(clean(point[1]!));
    else if (current.title === undefined) current.title = clean(line);
    else current.notes.push(clean(line));
  }
  finish();
  if (cues.length === 0) {
    throw new CueFileError('No cues found. Each cue starts with a line like “## Heading on the page”.');
  }
  return cues;
}
