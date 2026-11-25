/** Collapse whitespace and trim, so text compares the same across layouts and re-renders. */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The first `max` characters of an element's normalised text (as `textContent` gives it, without
 * forcing layout). Reads text nodes only until it has enough, so a large container costs no more
 * than a paragraph: matching scans thousands of candidates.
 */
export function elementText(element: Element, max = 160): string {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let raw = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    raw += node.nodeValue ?? '';
    // Whitespace collapses, so check the normalised length only once there may be enough.
    if (raw.length >= max && normalizeText(raw).length > max) break;
  }
  return normalizeText(raw).slice(0, max);
}

function bigrams(value: string): Map<string, number> {
  const result = new Map<string, number>();
  const text = value.toLowerCase();
  for (let i = 0; i < text.length - 1; i += 1) {
    const pair = text.slice(i, i + 2);
    result.set(pair, (result.get(pair) ?? 0) + 1);
  }
  return result;
}

/**
 * Sørensen–Dice similarity on character bigrams, from 0 (nothing shared) to 1 (identical).
 * Cheap, order-tolerant and robust to small edits, which suits matching a cue's stored text
 * against the current text of candidate elements.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  for (const [pair, count] of left) {
    const other = right.get(pair);
    if (other) shared += Math.min(count, other);
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/** Letters of right-to-left scripts: Hebrew, Arabic (with Persian and Urdu), Syriac, Thaana, N'Ko. */
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/gu;
const LETTER = /\p{L}/gu;

/**
 * Reading direction of a piece of text by the majority of its letters. `dir="auto"` only looks at
 * the first letter, so a Hebrew cue that starts with a product name ("ChillBoost מקרר…") would be
 * laid out left to right.
 */
export function textDirection(text: string): 'rtl' | 'ltr' {
  const rtl = text.match(RTL_LETTER)?.length ?? 0;
  const ltr = (text.match(LETTER)?.length ?? 0) - rtl;
  return rtl > ltr ? 'rtl' : 'ltr';
}

/** Scripts that need their own fonts, spacing or glyph forms, with the language tag that selects them. */
const SCRIPTS: [RegExp, string][] = [
  [/[\u3040-\u30FF]/gu, 'ja'], // Hiragana and Katakana: Japanese (checked before Han)
  [/[\uAC00-\uD7AF\u1100-\u11FF]/gu, 'ko'], // Hangul
  [/[\u4E00-\u9FFF\u3400-\u4DBF]/gu, 'zh'], // Han
  [/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/gu, 'ar'], // Arabic, Persian, Urdu
  [/[\u0590-\u05FF]/gu, 'he'],
  [/[\u0900-\u097F]/gu, 'hi'], // Devanagari
  [/[\u0E00-\u0E7F]/gu, 'th'],
];

/**
 * A language tag for the script most of `text` is written in, when that script needs it (so the
 * browser picks Japanese rather than Chinese glyphs for shared characters, and the styles can set
 * fonts and spacing per script). Undefined for Latin, Cyrillic and Greek, which need nothing.
 */
export function scriptLanguage(text: string): string | undefined {
  const letters = text.match(LETTER)?.length ?? 0;
  if (!letters) return undefined;
  let best: string | undefined;
  let bestCount = 0;
  for (const [pattern, language] of SCRIPTS) {
    const count = text.match(pattern)?.length ?? 0;
    // Kana anywhere means Japanese, even when Han characters outnumber it.
    if (language === 'ja' && count > 0) return 'ja';
    if (count > bestCount) [best, bestCount] = [language, count];
  }
  return bestCount * 3 >= letters ? best : undefined;
}
