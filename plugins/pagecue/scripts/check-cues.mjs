#!/usr/bin/env node
// Checks a pagecue cue file against the page source it belongs to.
//
//   node check-cues.mjs <cues.json | page.html> <source file or folder> [more sources...]
//
// It validates the cue file format and makes sure every cue that attaches through a
// `data-pagecue` value has a matching attribute in the sources (HTML, JSX, TSX, Vue, Svelte,
// Astro, Markdown...). Pass an HTML file as the first argument to check cues inlined in it
// (<script type="application/vnd.pagecue+json">). Attributes whose value is an expression, such as
// data-pagecue={id}, cannot be checked statically; cues that may rely on them are reported as
// warnings. Exit code 1 means something must be fixed.
// No dependencies; Node 18 or later.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.html', '.htm', '.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte', '.astro', '.md', '.mdx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.output', 'coverage']);
const ATTRIBUTE = /data-pagecue\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`$]+)["'`]\s*\})/g;
/** data-pagecue bound to an expression (a prop, a variable, a template literal). */
const DYNAMIC_ATTRIBUTE = /data-pagecue\s*=\s*\{(?!\s*["'`][^"'`$]+["'`]\s*\})|:data-pagecue\s*=|data-pagecue\s*=\s*\{?\s*`[^`]*\$\{/g;
const INLINE_CUES = /<script[^>]*type=["']application\/vnd\.pagecue\+json["'][^>]*>([\s\S]*?)<\/script>/i;

const [cueFilePath, ...sources] = process.argv.slice(2);
if (!cueFilePath || sources.length === 0) {
  console.error('Usage: node check-cues.mjs <cues.json> <source file or folder> [...]');
  process.exit(2);
}

const errors = [];
const warnings = [];

function files(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const child = join(path, name);
    return statSync(child).isDirectory() ? files(child) : SOURCE_EXTENSIONS.has(extname(name)) ? [child] : [];
  });
}

// ---------------------------------------------------------------- cue file

let file;
try {
  let text = readFileSync(cueFilePath, 'utf8');
  if (/\.html?$/i.test(cueFilePath)) {
    const inline = text.match(INLINE_CUES);
    if (!inline) {
      console.error(`✗ ${cueFilePath} has no <script type="application/vnd.pagecue+json"> cue block.`);
      process.exit(1);
    }
    text = inline[1];
  }
  file = JSON.parse(text);
} catch (error) {
  console.error(`✗ ${cueFilePath} does not contain valid JSON: ${error.message}`);
  process.exit(1);
}

if (file?.pagecue !== 1) errors.push('"pagecue" must be 1.');
if (!Array.isArray(file?.cues)) errors.push('"cues" must be an array.');
const cues = Array.isArray(file?.cues) ? file.cues : [];
const ids = new Set();

cues.forEach((cue, index) => {
  const where = `cues[${index}]${cue?.id ? ` ("${cue.id}")` : ''}`;
  if (typeof cue !== 'object' || cue === null) return errors.push(`${where} must be an object.`);
  if (typeof cue.id !== 'string' || !cue.id.trim()) errors.push(`${where} needs a non-empty "id".`);
  else if (ids.has(cue.id)) errors.push(`${where}: duplicate id.`);
  else ids.add(cue.id);
  if (typeof cue.title !== 'string') errors.push(`${where} needs a "title".`);
  else if (cue.title.trim().split(/\s+/).length > 10) warnings.push(`${where}: title has more than 10 words; keep it glanceable.`);
  const notes = typeof cue.notes === 'string' ? cue.notes.split('\n').filter((l) => l.trim()) : cue.notes ?? [];
  if (!Array.isArray(notes) || notes.some((line) => typeof line !== 'string')) {
    errors.push(`${where}: "notes" must be a string or an array of strings.`);
  } else if (notes.length > 4) {
    warnings.push(`${where}: ${notes.length} notes; three or fewer read best while presenting.`);
  }
  const validAnchor =
    cue.anchor === undefined ||
    (typeof cue.anchor === 'string' && cue.anchor.trim() !== '') ||
    (typeof cue.anchor === 'object' && cue.anchor !== null && typeof cue.anchor.tag === 'string');
  if (!validAnchor) {
    errors.push(`${where}: "anchor" must be a non-empty data-pagecue value or an anchor object with a "tag".`);
  }
});

// ---------------------------------------------------------------- sources

const found = new Map();
const dynamic = [];
for (const source of sources) {
  for (const path of files(source)) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(ATTRIBUTE)) {
      const value = match[1] ?? match[2] ?? match[3];
      found.set(value, [...(found.get(value) ?? []), path]);
    }
    if (DYNAMIC_ATTRIBUTE.test(text)) dynamic.push(path);
    DYNAMIC_ATTRIBUTE.lastIndex = 0;
  }
}

const wanted = new Set();
for (const cue of cues) {
  if (typeof cue?.id !== 'string') continue;
  const anchor = cue.anchor === undefined ? cue.id : typeof cue.anchor === 'string' ? cue.anchor : cue.anchor.cue;
  if (!anchor) continue; // full anchors without a data-pagecue value are resolved by the extension at runtime
  wanted.add(anchor);
  const places = found.get(anchor) ?? [];
  if (places.length === 0) {
    if (dynamic.length) {
      warnings.push(`cue "${cue.id}": no literal data-pagecue="${anchor}"; make sure a dynamic data-pagecue (in ${dynamic.join(', ')}) renders it.`);
    } else {
      errors.push(`cue "${cue.id}": no element has data-pagecue="${anchor}".`);
    }
  }
  if (places.length > 1) {
    warnings.push(`cue "${cue.id}": data-pagecue="${anchor}" appears ${places.length} times (fine for a component rendered once; the page must contain it exactly once).`);
  }
}
for (const value of found.keys()) {
  if (!wanted.has(value)) warnings.push(`data-pagecue="${value}" has no cue in the file; the prompter will title it after the element.`);
}

// ---------------------------------------------------------------- report

for (const warning of warnings) console.log(`! ${warning}`);
for (const error of errors) console.log(`✗ ${error}`);
if (errors.length) {
  console.log(`\n${errors.length} problem(s) to fix.`);
  process.exit(1);
}
console.log(`✓ ${cues.length} cues, all attached (${found.size} data-pagecue attributes found).`);
