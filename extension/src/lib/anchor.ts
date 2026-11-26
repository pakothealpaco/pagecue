import type { Anchor } from './types';
import { elementText, normalizeText, similarity } from './text';

/** Attribute a site puts on elements to give pagecue a stable anchor. */
export const CUE_ATTRIBUTE = 'data-pagecue';

/** Below this similarity a text match is treated as a different element. */
export const TEXT_MATCH_THRESHOLD = 0.7;

/** Fuzzy matching scans at most this many candidates, so huge pages stay fast. */
const MAX_FUZZY_CANDIDATES = 4000;

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

/** Text of the closest heading at or before `element` in document order. */
export function nearestHeading(element: Element): string | undefined {
  if (element.matches(HEADING_SELECTOR)) return elementText(element, 80) || undefined;
  const own = element.querySelector(HEADING_SELECTOR);
  if (own) return elementText(own, 80) || undefined;

  const headings = element.ownerDocument.querySelectorAll(HEADING_SELECTOR);
  let found: Element | undefined;
  for (const heading of headings) {
    // DOCUMENT_POSITION_PRECEDING: the heading comes before the element.
    if (element.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_PRECEDING) found = heading;
    else break;
  }
  return found ? elementText(found, 80) || undefined : undefined;
}

export type ResolvedBy = 'cue' | 'id' | 'testId' | 'selector' | 'text';

export interface Resolution {
  element: Element;
  by: ResolvedBy;
  /** 1 for exact anchors; the text similarity for fuzzy matches. */
  confidence: number;
}

function single(root: ParentNode, selector: string): Element | null {
  try {
    const matches = root.querySelectorAll(selector);
    return matches.length === 1 ? matches[0]! : null;
  } catch {
    return null;
  }
}

/** A structural match is trusted only if its text still looks like what was anchored. */
function textAgrees(anchor: Anchor, element: Element): boolean {
  if (!anchor.text) return true;
  return similarity(anchor.text, elementText(element)) >= TEXT_MATCH_THRESHOLD;
}

/** False for elements that take no space (display: none and similar). Unknown in old browsers: assume rendered. */
function isRendered(element: Element): boolean {
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

/** Where text given without a tag (a cue file's `near`) is looked for: headings first, then text blocks. */
const NEAR_SELECTORS = [HEADING_SELECTOR, 'p,li,dt,dd,th,td,figcaption,caption,summary,label,strong,b,span,div'];

function fuzzyMatch(anchor: Anchor, root: Document): Resolution | null {
  if (!anchor.text) return null;
  if (anchor.tag === '*') {
    for (const selector of NEAR_SELECTORS) {
      const found = bestMatch(anchor, [...root.querySelectorAll(selector)]);
      if (found) return found;
    }
    return null;
  }
  return bestMatch(anchor, root.getElementsByTagName(anchor.tag));
}

function bestMatch(anchor: Anchor, candidates: ArrayLike<Element>): Resolution | null {
  if (!anchor.text) return null;
  const limit = Math.min(candidates.length, MAX_FUZZY_CANDIDATES);

  let best: Resolution | null = null;
  for (let i = 0; i < limit; i += 1) {
    const element = candidates[i]!;
    let score = similarity(anchor.text, elementText(element));
    if (score < TEXT_MATCH_THRESHOLD - 0.1) continue;
    // Themes often render a heading twice (one copy hidden for another breakpoint); never pick a
    // hidden copy. Checked after the cheap text test, since it can force style work.
    if (!isRendered(element)) continue;
    if (anchor.heading && nearestHeading(element) === anchor.heading) score = Math.min(1, score + 0.1);
    if (score >= TEXT_MATCH_THRESHOLD && (!best || score > best.confidence)) {
      best = { element, by: 'text', confidence: score };
    }
  }
  return best;
}

/**
 * True when an element found earlier still is what the anchor describes, so it can be reused
 * without searching the page again (re-resolving runs on every DOM change).
 */
export function stillAnchored(anchor: Anchor, element: Element): boolean {
  if (!element.isConnected || !isRendered(element)) return false;
  if (anchor.cue) return element.getAttribute(CUE_ATTRIBUTE) === anchor.cue;
  if (anchor.id && element.id !== anchor.id) return false;
  if (anchor.tag !== '*' && element.tagName.toLowerCase() !== anchor.tag) return false;
  return textAgrees(anchor, element);
}

const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');

/**
 * Finds the element an anchor points to, trying the most reliable anchor first:
 * site cue attribute → id → test id → CSS selector → fuzzy text match.
 * Structural matches (id, test id, selector) are rejected when the element's text no longer agrees.
 * Returns null when nothing is good enough; the cue is then shown as missing, never silently moved.
 */
export function resolveAnchor(anchor: Anchor, root: Document = document): Resolution | null {
  if (anchor.cue) {
    const element = single(root, `[${CUE_ATTRIBUTE}="${cssEscape(anchor.cue)}"]`);
    if (element) return { element, by: 'cue', confidence: 1 };
  }

  if (anchor.id) {
    const element = root.getElementById(anchor.id);
    if (element && textAgrees(anchor, element)) return { element, by: 'id', confidence: 1 };
  }

  if (anchor.testId) {
    const element = single(root, `[${anchor.testId.attr}="${cssEscape(anchor.testId.value)}"]`);
    if (element && textAgrees(anchor, element)) return { element, by: 'testId', confidence: 1 };
  }

  if (anchor.selector) {
    const element = single(root, anchor.selector);
    if (element && textAgrees(anchor, element)) return { element, by: 'selector', confidence: 1 };
  }

  return fuzzyMatch(anchor, root);
}

/** A short label for an element, shown while picking and as a default cue title. */
export function describeElement(element: Element): string {
  const heading = element.matches(HEADING_SELECTOR) ? element : element.querySelector(HEADING_SELECTOR);
  const label =
    (heading && elementText(heading, 60)) ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    elementText(element, 60);
  return normalizeText(label ?? '') || `<${element.tagName.toLowerCase()}>`;
}

/** Shortest text that makes a useful anchor for a cue added by hand. */
const MIN_ANCHOR_TEXT = 12;

/**
 * An anchor for the part of the page around `element`, for a cue the presenter adds by hand: the
 * nearest block (from `element` upwards) with enough text that the anchor finds it again, and only it.
 */
export function anchorNear(element: Element): { element: Element; anchor: Anchor } | null {
  const body = element.ownerDocument.body;
  for (let current: Element | null = element; current && current !== body; current = current.parentElement) {
    const text = elementText(current);
    if (text.length < MIN_ANCHOR_TEXT) continue;
    const anchor: Anchor = { tag: current.tagName.toLowerCase(), text };
    const heading = nearestHeading(current);
    if (heading) anchor.heading = heading;
    if (resolveAnchor(anchor, current.ownerDocument)?.element === current) return { element: current, anchor };
  }
  return null;
}
