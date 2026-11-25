import type { CuePosition } from './types';

/** Where the "current" cue is read, as a share of the visible height from the top. Both the page and the prompter use it. */
export const READING_LINE = 0.3;

/**
 * Maps between a scroll position and a position in the cue sequence.
 *
 * Both sides (the page and the prompter) describe where they are as "cue `index`, `progress` of the
 * way to the next cue", each from its own layout. Because neither side ever sees the other's pixels,
 * the sync works across any window sizes and zoom levels. This is the same idea as the anchor
 * interpolation in VS Code's Markdown preview scroll sync.
 *
 * All coordinates are in one frame (for example viewport pixels); only differences matter.
 */
export interface Layout {
  /** Top edge of each cue's element, sorted ascending. */
  tops: readonly number[];
  /** Where the content ends; the span after the last cue runs to here. */
  end: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function nextTop(layout: Layout, index: number): number {
  return index + 1 < layout.tops.length ? layout.tops[index + 1]! : Math.max(layout.end, layout.tops[index]! + 1);
}

/**
 * Scrolling moves in whole pixels, so a cue scrolled to the reading line can end up a fraction of
 * a pixel below it. A start this close to the line counts as reached.
 */
const REACHED = 1;

/** The cue position at a reading line. */
export function positionAt(layout: Layout, line: number): CuePosition {
  const { tops } = layout;
  if (tops.length === 0 || line + REACHED < tops[0]!) return { index: -1, progress: 0 };

  // The last cue (in page order) whose top is at or above the reading line. A linear scan, because
  // sections side by side or laid out by CSS grid need not be sorted by their tops.
  let low = 0;
  tops.forEach((top, index) => {
    if (top <= line + REACHED) low = index;
  });

  const top = tops[low]!;
  const span = nextTop(layout, low) - top;
  return { index: low, progress: span > 0 ? clamp01((line - top) / span) : 0 };
}

/** The coordinate that should sit at the reading line to show a cue position. */
export function offsetOf(layout: Layout, position: CuePosition): number | null {
  const { tops } = layout;
  if (tops.length === 0) return null;
  if (position.index < 0) return tops[0]!;
  const index = Math.min(position.index, tops.length - 1);
  const top = tops[index]!;
  return top + clamp01(position.progress) * (nextTop(layout, index) - top);
}

/**
 * When a page cannot scroll far enough to bring its last cues to the reading line, they would never
 * become active. At the very end of the scroll range, promote the last cue that is visible.
 */
export function promoteAtEnd(position: CuePosition, layout: Layout, viewportBottom: number): CuePosition {
  let lastVisible = -1;
  layout.tops.forEach((top, index) => {
    if (top < viewportBottom) lastVisible = index;
  });
  return lastVisible > position.index ? { index: lastVisible, progress: 0 } : position;
}

/** True when two positions differ enough to be worth sending. */
export function positionChanged(a: CuePosition | null, b: CuePosition, epsilon = 0.01): boolean {
  return !a || a.index !== b.index || Math.abs(a.progress - b.progress) > epsilon;
}

/** A section's vertical extent, in the same frame as the reading line. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * Where each cue starts, before the presenter's adjustments: one point per section, in page order.
 *
 * A section normally starts at its top. Sections that sit side by side (they start in the upper half
 * of the row the previous ones occupy) share their row: the row is split evenly between them in page
 * order, so exactly one cue is current at any moment and "next" always moves the page.
 */
export function basePoints(spans: readonly Span[]): number[] {
  const points: number[] = [];
  let start = 0;
  while (start < spans.length) {
    let top = spans[start]!.top;
    let bottom = spans[start]!.bottom;
    let end = start + 1;
    while (end < spans.length) {
      const next = spans[end]!;
      if (next.top >= bottom || next.top > top + (bottom - top) / 2) break;
      top = Math.min(top, next.top);
      bottom = Math.max(bottom, next.bottom);
      end += 1;
    }
    const count = end - start;
    for (let k = 0; k < count; k += 1) {
      points.push(count === 1 ? spans[start]!.top : top + (k * (bottom - top)) / count);
    }
    start = end;
  }
  return points;
}

/** Smallest distance kept between two cue starts, in pixels. */
export const MIN_GAP = 8;

/** A cue's start before ordering: its base point, its section's height and the adjusted start. */
export interface Start {
  base: number;
  height: number;
  start: number;
}

/**
 * Where each cue starts, from spans in page (document) order: the base points moved by the
 * presenter's adjustments. `shifts[i]` is a share of the section's own height (0.5 moves the start
 * half a section down, -0.25 a quarter up), so an adjustment survives other window sizes.
 */
export function startPoints(spans: readonly Span[], shifts: readonly (number | undefined)[] = []): Start[] {
  return basePoints(spans).map((base, i) => {
    const height = Math.max(1, spans[i]!.bottom - spans[i]!.top);
    return { base, height, start: base + (shifts[i] ?? 0) * height };
  });
}

/** Keeps points in the given order at least `MIN_GAP` apart, so cue starts never cross. */
export function keepApart(points: readonly number[]): number[] {
  const result: number[] = [];
  points.forEach((point, i) => result.push(i > 0 ? Math.max(point, result[i - 1]! + MIN_GAP) : point));
  return result;
}

/** Where each cue starts, in page order, adjusted and kept apart. */
export function breakpoints(spans: readonly Span[], shifts: readonly (number | undefined)[] = []): number[] {
  return keepApart(startPoints(spans, shifts).map((point) => point.start));
}

/**
 * The shift that puts a cue's start at `y`, kept between its neighbours' starts (`before` and
 * `after`, either may be absent).
 */
export function shiftFor(start: Pick<Start, 'base' | 'height'>, y: number, before?: number, after?: number): number {
  const low = before === undefined ? -Infinity : before + MIN_GAP;
  const high = after === undefined ? Infinity : after - MIN_GAP;
  const clamped = Math.min(high, Math.max(low, y));
  return Math.round(((clamped - start.base) / start.height) * 1000) / 1000;
}
