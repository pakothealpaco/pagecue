import { READING_LINE } from '../lib/position';

/**
 * Finding and driving the element that actually scrolls.
 *
 * Many dashboards and apps scroll an inner container rather than the window. pagecue picks the
 * scroll container that holds most cue elements, and measures everything against its visible box.
 */

export interface Scroller {
  /** The scrolling element, or null for the window. */
  element: HTMLElement | null;
}

function isScrollable(element: HTMLElement): boolean {
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  const { overflowY } = getComputedStyle(element);
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

/** The nearest scrolling ancestor of `element`, or null when the window scrolls it. */
export function scrollParent(element: Element): HTMLElement | null {
  let current = element.parentElement;
  const root = element.ownerDocument.scrollingElement;
  while (current && current !== root && current !== element.ownerDocument.body) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }
  return null;
}

/** The scroll container shared by most of `elements`; the window when there is no clear winner. */
export function primaryScroller(elements: readonly Element[]): Scroller {
  const counts = new Map<HTMLElement | null, number>();
  for (const element of elements) {
    const parent = scrollParent(element);
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  let best: HTMLElement | null = null;
  let bestCount = counts.get(null) ?? 0;
  for (const [parent, count] of counts) {
    if (parent && count > bestCount) {
      best = parent;
      bestCount = count;
    }
  }
  return { element: best };
}

/** The visible box of the scroller in viewport coordinates. */
export function viewportOf(scroller: Scroller): { top: number; bottom: number; height: number } {
  if (!scroller.element) return { top: 0, bottom: window.innerHeight, height: window.innerHeight };
  const rect = scroller.element.getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  return { top, bottom, height: Math.max(bottom - top, 0) };
}

export function readingLine(scroller: Scroller): number {
  const view = viewportOf(scroller);
  return view.top + view.height * READING_LINE;
}

/** Bottom of the scrollable content in viewport coordinates. */
export function contentEnd(scroller: Scroller): number {
  if (!scroller.element) {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollHeight - window.scrollY;
  }
  const rect = scroller.element.getBoundingClientRect();
  return rect.top + scroller.element.scrollHeight - scroller.element.scrollTop;
}

export function atEnd(scroller: Scroller): boolean {
  if (!scroller.element) {
    const root = document.scrollingElement ?? document.documentElement;
    return window.scrollY + window.innerHeight >= root.scrollHeight - 2;
  }
  const el = scroller.element;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
}

export function scrollByAmount(scroller: Scroller, delta: number, smooth: boolean): void {
  const options: ScrollToOptions = { top: delta, behavior: smooth ? 'smooth' : 'instant' };
  if (scroller.element) scroller.element.scrollBy(options);
  else window.scrollBy(options);
}
