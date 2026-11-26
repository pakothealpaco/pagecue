/**
 * Pages whose content lives in a frame.
 *
 * Some pages show everything inside one big iframe from another site: claude.ai artifacts
 * (claudeusercontent.com), embedded reports, preview tools. The outer page then has no headings and
 * never scrolls, so pagecue would find none of the cues. The outer page's content script notices
 * the frame and hands the page to pagecue's content script inside it, which loads the tab's cues and
 * does everything the outer one would have done.
 *
 * The handoff is a bare signal through `postMessage`: no cue data ever crosses into a page. The
 * frame learns which page it serves (the tab's address) from the extension, not from the message.
 */

/** Outer page to frame: "you hold this page's content now". */
export const HANDOFF = 'pagecue:content-frame';
/** Frame to outer page: "pagecue is running here and took over". */
export const HANDOFF_ACK = 'pagecue:content-frame-ack';

/** Share of the viewport a frame must cover to count as the page's content. */
const COVERS = 0.6;
/**
 * Sites that only ever serve documents made to be read in a frame (Claude's artifacts). Their frame
 * counts at a smaller share, so an artifact shown in the panel beside a chat works too.
 */
const CONTENT_FRAME_SITES = /(^|\.)claudeusercontent\.com$/i;
const COVERS_CONTENT_FRAME = 0.25;

/** Share of the viewport a frame at `src` must cover to count as the page's content. */
export function coverageNeeded(src: string): number {
  try {
    return CONTENT_FRAME_SITES.test(new URL(src).hostname) ? COVERS_CONTENT_FRAME : COVERS;
  } catch {
    return COVERS;
  }
}

/**
 * The iframe that holds this page's content, if the page itself is only a shell around one: the
 * document does not scroll and one visible frame covers most of the window.
 */
export function coveringFrame(doc: Document = document): HTMLIFrameElement | null {
  const root = doc.scrollingElement ?? doc.documentElement;
  const view = doc.defaultView;
  if (!view || root.scrollHeight > view.innerHeight + 40) return null;
  const area = view.innerWidth * view.innerHeight;
  let best: HTMLIFrameElement | null = null;
  let bestArea = 0;
  for (const frame of framesIn(doc)) {
    const rect = frame.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, view.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, view.innerHeight) - Math.max(rect.top, 0));
    if (width * height > bestArea) {
      best = frame;
      bestArea = width * height;
    }
  }
  return best && bestArea >= area * coverageNeeded(best.src) ? best : null;
}

/** Every iframe in the document, also inside open shadow roots (app shells built from web components). */
function framesIn(root: Document | ShadowRoot): HTMLIFrameElement[] {
  const frames = [...root.querySelectorAll('iframe')];
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) frames.push(...framesIn(element.shadowRoot));
  }
  return frames;
}

/** What pagecue needs access to before it can run inside a frame. */
export interface FrameAccess {
  /** Match pattern to ask Chrome for, covering the frame's whole site (`https://*.example.com/*`). */
  pattern: string;
  /** The site, for the presenter: `example.com`. */
  site: string;
}

/**
 * The access a frame at `src` needs. Frames like these often get a new subdomain per document
 * (`<random>.frame.claudeusercontent.com`), so the pattern covers the site and all its subdomains.
 */
export function frameAccess(src: string): FrameAccess | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const labels = url.hostname.split('.');
  // Two labels make a site (`example.com`), three for country second-level domains (`example.co.uk`).
  const keep = labels.length >= 3 && labels.at(-1)!.length === 2 && labels.at(-2)!.length <= 3 ? 3 : 2;
  if (labels.length <= keep || /^[\d.]+$/.test(url.hostname)) {
    return { pattern: `${url.protocol}//${url.hostname}/*`, site: url.hostname };
  }
  const site = labels.slice(-keep).join('.');
  return { pattern: `${url.protocol}//*.${site}/*`, site };
}
