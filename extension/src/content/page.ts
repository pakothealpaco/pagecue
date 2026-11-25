import { browser, type Browser } from 'wxt/browser';
import { anchorNear, CUE_ATTRIBUTE, describeElement, resolveAnchor, stillAnchored } from '../lib/anchor';
import { elementText, normalizeText } from '../lib/text';
import type { CueChange } from '../lib/cueChange';
import { CUE_FILE_TYPE, CueFileError, parseCueFile } from '../lib/cueFile';
import {
  keepApart,
  offsetOf,
  positionAt,
  positionChanged,
  promoteAtEnd,
  shiftFor,
  startPoints,
  type Layout,
  type Start,
} from '../lib/position';
import type {
  MainFrameReply,
  MainFrameRequest,
  PageMessage,
  PingReply,
  PrompterMessage,
  RuntimeMessage,
} from '../lib/protocol';
import { PORT_NAME } from '../lib/protocol';
import { ScrollGuard, USER_INPUT_EVENTS } from '../lib/scrollGuard';
import { siteKey } from '../lib/siteKey';
import { getSite, newCueId, pageKeyFor, requestChange, setAlias, watchSite } from '../lib/store';
import type { Cue, CuePosition, PageCueState } from '../lib/types';
import { coveringFrame, frameAccess, HANDOFF, HANDOFF_ACK, type FrameAccess } from './frames';
import { SectionOverlay, type OverlayMark } from './overlay';
import { sectionOf } from './region';
import {
  atEnd,
  contentEnd,
  primaryScroller,
  readingLine,
  scrollByAmount,
  scrollParent,
  viewportOf,
  type Scroller,
} from './scroller';

interface ResolvedCue {
  cue: Cue;
  element: Element | null;
  /** The whole section the cue covers (see `sectionOf`). */
  section: Element | null;
  /** Place of its element in the document, among found cues. */
  docIndex: number;
}

type FoundCue = ResolvedCue & { element: Element; section: Element };

const RESOLVE_DEBOUNCE_MS = 400;
/** Pages that never stop changing (live dashboards) are still re-resolved at least this often. */
const RESOLVE_MAX_WAIT_MS = 2000;
const URL_POLL_MS = 700;
/** An address replaced this soon after scrolling follows the scrolling (see `checkNavigation`). */
const SCROLL_RENAME_MS = 1500;
/** How often to ask the local bridge for cues an agent just published, while a prompter is open. */
const BRIDGE_POLL_MS = 3000;
/** How often to look for a frame that holds the page's content, and to signal it. */
const HANDOFF_POLL_MS = 1000;
/** A frame that has not answered by then has no pagecue in it: ask the presenter for access. */
const HANDOFF_WAIT_MS = 1500;

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** A placeholder cue for a `data-pagecue` element that no cue file describes. */
function placeholderCue(element: Element, now: number): Cue {
  const id = element.getAttribute(CUE_ATTRIBUTE)!;
  return {
    id,
    anchor: { cue: id, tag: element.tagName.toLowerCase() },
    title: describeElement(element),
    notes: '',
    origin: 'site',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Everything pagecue does inside a page: loads the site's cues, finds their elements, reports the
 * current cue to the prompter while the presenter scrolls, and scrolls when the prompter asks.
 * It draws nothing on the page unless the presenter turns on section lines (see `overlay.ts`).
 *
 * Until a prompter connects it only imports the site's own cues once per page, so remembered
 * sites cost nothing while you browse them. Tracking (DOM observer, URL polling, positions) runs
 * only while at least one prompter is connected.
 */
export class PageController {
  /**
   * `main`: this frame shows the page being presented (the top frame, or a frame it handed the page
   * to). `waiting`: a frame no one handed the page to; it does nothing. `host`: the top frame after
   * handing its page to a frame inside it (see `frames.ts`).
   */
  private role: 'main' | 'waiting' | 'host' = window === window.top ? 'main' : 'waiting';
  /** The tab's address and title, when this is a frame the page was handed to. */
  private tab: MainFrameReply | null = null;
  /** The frame this page is handing itself to, and since when. */
  private handoff: { frame: HTMLIFrameElement; since: number; injected: boolean } | null = null;
  private frameAccess: FrameAccess | undefined;
  /** A frame taking the page, between the handoff and the extension's answer. */
  private claiming = false;
  private handoffTimer: number | undefined;
  private key = siteKey(location.href);
  private href = location.href;
  private cues: Cue[] = [];
  private resolved: ResolvedCue[] = [];
  private scroller: Scroller = { element: null };
  private readonly ports = new Set<Browser.runtime.Port>();
  private readonly guard = new ScrollGuard();
  private readonly observer = new MutationObserver(() => this.handleMutations());
  private lastPosition: CuePosition | null = null;
  private lastState = '';
  private siteFileError: string | undefined;
  private frame = 0;
  private resolveTimer: number | undefined;
  private resolvePendingSince: number | undefined;
  private pollTimer: number | undefined;
  private bridgeTimer: number | undefined;
  /** `publishedAt` of the last bridge cues imported for the current page. */
  private bridgeSeen = 0;
  /** Bumped on every load, so a load that finishes after a newer one started does nothing. */
  private generation = 0;
  /** False until the current page's own cues have been imported; placeholders wait for it. */
  private siteImportDone = false;
  private unwatch: (() => void) | undefined;
  private stopped = false;
  /** Prompters that asked for section lines on the page. */
  private readonly linesWanted = new Set<Browser.runtime.Port>();
  private readonly overlay = new SectionOverlay({
    onDrag: (index, y) => this.dragStart(index, y),
    onDrop: (index) => this.dropStart(index),
    onReset: (index) => this.setStart(index, 0),
    onAdd: () => this.addCueHere(),
  });
  /** A start being dragged, before it is saved: cue index and shift. */
  private draft: { index: number; shift: number } | null = null;
  private overlayFrame = 0;

  async start(): Promise<void> {
    window.addEventListener('message', this.handleFrameMessage);
    // A frame waits until the page around it hands it the page.
    if (this.role === 'main') await this.becomeMain();
  }

  private async becomeMain(): Promise<void> {
    if (window !== window.top) {
      // A frame serves the tab's page: learn its address first.
      const reply = await this.tabInfo(false);
      if (!reply?.url) return;
      this.tab = reply;
    }
    this.role = 'main';
    browser.runtime.onConnect.addListener(this.handleConnect);
    browser.runtime.onMessage.addListener(this.handleRuntimeMessage);

    document.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
    document.addEventListener('scrollend', this.handleScrollEnd, { capture: true, passive: true });
    for (const type of USER_INPUT_EVENTS) {
      window.addEventListener(type, this.handleUserInput, { capture: true, passive: true });
    }
    window.addEventListener('resize', this.scheduleResolve, { passive: true });

    const nav = (window as Window & { navigation?: EventTarget }).navigation;
    nav?.addEventListener('navigate', this.noteNavigation);
    nav?.addEventListener('navigatesuccess', this.checkNavigation);
    window.addEventListener('popstate', this.checkNavigation);
    window.addEventListener('hashchange', this.checkNavigation);

    // Listening now: point the prompter here.
    void this.tabInfo(true);
    await this.load();
  }

  private async tabInfo(claim: boolean): Promise<MainFrameReply | undefined> {
    return (await browser.runtime
      .sendMessage({ type: 'main-frame', claim } satisfies MainFrameRequest)
      .catch(() => undefined)) as MainFrameReply | undefined;
  }

  /** The address of the page being presented: the tab's, also when this is a frame inside it. */
  private pageUrl(): string {
    return this.tab?.url ?? location.href;
  }

  private pageTitle(): string {
    return this.tab?.title || document.title;
  }

  /**
   * Messages between frames (see `frames.ts`). In a frame: the page around it hands it the page.
   * In the top frame: the frame it is handing the page to says pagecue runs there.
   */
  private readonly handleFrameMessage = (event: MessageEvent): void => {
    const data = event.data as { pagecue?: unknown } | null;
    if (!data || typeof data !== 'object' || !this.alive()) return;
    if (data.pagecue === HANDOFF && event.source === window.parent && window !== window.top) {
      const parent = event.source as Window;
      if (this.role === 'waiting') {
        if (this.claiming) return;
        this.claiming = true;
        // Answer once ready, so the page lets go of the prompter only when this frame can take it.
        void this.becomeMain()
          .then(() => {
            if (this.role === 'main') parent.postMessage({ pagecue: HANDOFF_ACK }, '*');
          })
          .finally(() => (this.claiming = false));
      } else if (this.role === 'main') {
        parent.postMessage({ pagecue: HANDOFF_ACK }, '*');
        // Sent again after the tab moved to another address: follow it.
        void this.tabInfo(false).then((reply) => {
          if (!reply?.url || reply.url === this.tab?.url) return;
          this.tab = reply;
          if (siteKey(reply.url) !== this.key) void this.load();
        });
      }
      return;
    }
    if (data.pagecue === HANDOFF_ACK && this.handoff && event.source === this.handoff.frame.contentWindow) {
      if (this.role === 'main') this.becomeHost();
    }
  };

  /**
   * Hands the page to a frame that holds its content, when this page is only a shell around one.
   * Runs while a prompter is connected and no cue was found here.
   */
  private checkHandoff(): void {
    if (this.role !== 'main' || window !== window.top || !this.connected) return;
    const frame = this.found().length ? null : coveringFrame();
    if (!frame) {
      this.handoff = null;
      if (this.frameAccess) {
        this.frameAccess = undefined;
        this.sendState();
      }
      return;
    }
    const now = performance.now();
    if (this.handoff?.frame !== frame) this.handoff = { frame, since: now, injected: false };
    frame.contentWindow?.postMessage({ pagecue: HANDOFF }, '*');
    const waited = now - this.handoff.since;
    if (!this.handoff.injected && waited >= HANDOFF_WAIT_MS) {
      // The frame loaded a new document after pagecue was injected (apps do), so nothing answers:
      // inject again. Where pagecue has no access, nothing happens and the presenter is asked.
      this.handoff.injected = true;
      void browser.runtime.sendMessage({ type: 'inject-frames' }).catch(() => undefined);
    }
    if (!this.frameAccess && waited >= HANDOFF_WAIT_MS * 2) {
      this.frameAccess = frameAccess(frame.src) ?? undefined;
      if (this.frameAccess) this.sendState();
    }
  }

  /** The frame took the page: let go of the prompter, which moves to the frame. */
  private becomeHost(): void {
    this.role = 'host';
    this.frameAccess = undefined;
    for (const port of [...this.ports]) port.disconnect();
    this.ports.clear();
    this.linesWanted.clear();
    this.setTracking(false);
    // Keep watching the address: a move to another page starts over (see `checkNavigation`).
    this.pollTimer = window.setInterval(this.checkNavigation, URL_POLL_MS);
  }

  /** Removes every listener. Used when the extension is updated or removed under a live page. */
  private stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.observer.disconnect();
    window.clearInterval(this.handoffTimer);
    window.removeEventListener('message', this.handleFrameMessage);
    window.clearInterval(this.pollTimer);
    window.clearInterval(this.bridgeTimer);
    window.clearTimeout(this.resolveTimer);
    this.unwatch?.();
    this.overlay.hide();
    document.removeEventListener('scroll', this.handleScroll, { capture: true });
    document.removeEventListener('scrollend', this.handleScrollEnd, { capture: true });
    for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, this.handleUserInput, { capture: true });
    window.removeEventListener('resize', this.scheduleResolve);
    const nav = (window as Window & { navigation?: EventTarget }).navigation;
    nav?.removeEventListener('navigate', this.noteNavigation);
    nav?.removeEventListener('navigatesuccess', this.checkNavigation);
    window.removeEventListener('popstate', this.checkNavigation);
    window.removeEventListener('hashchange', this.checkNavigation);
  }

  /** After an extension update the old content script loses its connection to the extension. */
  private alive(): boolean {
    if (!this.stopped && !browser.runtime?.id) this.stop();
    return !this.stopped;
  }

  private get connected(): boolean {
    return this.ports.size > 0;
  }

  // ---------------------------------------------------------------- loading

  /** Loads stored cues for the current URL, then merges in the site's own cues. */
  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.siteImportDone = false;
    this.bridgeSeen = 0;
    const key = await pageKeyFor(siteKey(this.pageUrl())).catch(() => siteKey(this.pageUrl()));
    if (generation !== this.generation) return;
    this.key = key;
    this.unwatch?.();
    this.unwatch = watchSite(key, (record) => {
      if (generation !== this.generation) return;
      this.cues = record?.cues ?? [];
      if (this.connected) this.resolve();
    });
    this.cues = [];

    const stored = await getSite(key);
    if (generation !== this.generation) return;
    this.cues = stored?.cues ?? [];
    if (this.connected) this.resolve();

    await this.importSiteCues(generation, key);
    if (generation !== this.generation) return;
    this.siteImportDone = true;
    if (this.connected) this.importNewAttributes();
  }

  private async readSiteCueFile(): Promise<unknown | null> {
    const inline = document.querySelector(`script[type="${CUE_FILE_TYPE}"]`);
    if (inline?.textContent?.trim()) return JSON.parse(inline.textContent);

    const link = document.querySelector<HTMLLinkElement>(`link[rel~="alternate"][type="${CUE_FILE_TYPE}"]`);
    if (!link?.href) return null;
    // The background worker fetches it, limited to the page's own origin and a size cap.
    const reply = (await browser.runtime.sendMessage({ type: 'fetch-cue-file', url: link.href })) as
      { ok: true; text: string } | { ok: false; error: string };
    if (!reply.ok) throw new CueFileError(`Could not load ${link.getAttribute('href')}: ${reply.error}`);
    return JSON.parse(reply.text);
  }

  /** Cues an agent published for this page through the local bridge, if they are new. */
  private async readBridgeCues(key: string): Promise<unknown | null> {
    const entry = (await browser.runtime.sendMessage({ type: 'fetch-bridge-cues', key })) as {
      publishedAt: number;
      cueFile: unknown;
    } | null;
    if (!entry || entry.publishedAt <= this.bridgeSeen) return null;
    this.bridgeSeen = entry.publishedAt;
    return entry.cueFile;
  }

  /** While a prompter is open, picks up cues an agent publishes for this page. */
  private async pollBridge(): Promise<void> {
    if (!this.alive() || !this.siteImportDone) return;
    const generation = this.generation;
    const key = this.key;
    let cues: Cue[];
    try {
      const file = await this.readBridgeCues(key);
      if (!file || generation !== this.generation) return;
      cues = parseCueFile(file);
    } catch (error) {
      this.siteFileError = `Cues from your agent: ${error instanceof Error ? error.message : String(error)}`;
      this.sendState(true);
      return;
    }
    this.siteFileError = undefined;
    await this.change(key, { kind: 'merge-site', cues, present: cues.map((cue) => cue.id) });
  }

  /**
   * Imports the cues a site ships: its cue file (inline or linked), plus a placeholder for every
   * `data-pagecue` element the file does not describe. When the file cannot be read, nothing is
   * imported, so a temporary error never removes cues.
   */
  private async importSiteCues(generation: number, key: string): Promise<void> {
    this.siteFileError = undefined;
    let fromFile: Cue[] | null = null;
    try {
      // The page's own cue file wins; otherwise cues an agent published for this page.
      const file = (await this.readSiteCueFile()) ?? (await this.readBridgeCues(key));
      if (file) fromFile = parseCueFile(file);
    } catch (error) {
      if (generation !== this.generation) return;
      this.siteFileError = error instanceof Error ? error.message : String(error);
      this.sendState(true);
      return;
    }
    if (generation !== this.generation) return;

    const described = new Set((fromFile ?? []).map((cue) => cue.anchor.cue ?? cue.id));
    const now = Date.now();
    const attributes = [...document.querySelectorAll(`[${CUE_ATTRIBUTE}]`)];
    const fromAttributes = attributes
      .filter((element) => !described.has(element.getAttribute(CUE_ATTRIBUTE)!))
      .map((element) => placeholderCue(element, now));

    const fromSite = [...(fromFile ?? []), ...fromAttributes];
    if (fromSite.length === 0) return;

    // With a cue file, the file plus the attributes on the page are the site's full list, and
    // cues the site dropped go away. Without one, parts of the page may not have rendered yet.
    const present = fromFile ? fromSite.map((cue) => cue.id) : null;
    await this.change(key, { kind: 'merge-site', cues: fromSite, present });
  }

  /** `data-pagecue` elements that appeared after load (lazy sections, client-side routes). */
  private importNewAttributes(): void {
    if (!this.siteImportDone) return;
    const known = new Set(this.cues.flatMap((cue) => [cue.id, cue.anchor.cue]));
    const now = Date.now();
    const added = [...document.querySelectorAll(`[${CUE_ATTRIBUTE}]`)]
      .filter((element) => !known.has(element.getAttribute(CUE_ATTRIBUTE)!))
      .map((element) => placeholderCue(element, now));
    if (added.length) void this.change(this.key, { kind: 'merge-site', cues: added, present: null });
  }

  private async change(key: string, change: CueChange): Promise<void> {
    if (!this.alive()) return;
    await requestChange(key, { title: this.pageTitle(), url: this.pageUrl() }, change).catch(() => undefined);
  }

  // ---------------------------------------------------------------- resolving

  /**
   * Finds every cue's element, then orders found cues by where they start on the page (missing cues
   * last). The start, not the element's place in the document, decides the order: a cue added by
   * hand or dragged sits where its line is.
   */
  private resolve(): void {
    if (!this.alive()) return;
    // Reuse elements found last time while they still match; search the page only for the rest.
    const previous = new Map(this.resolved.map((entry) => [entry.cue.id, entry]));
    const resolved = this.cues.map((cue) => {
      const before = previous.get(cue.id);
      const reuse =
        before?.element &&
        JSON.stringify(before.cue.anchor) === JSON.stringify(cue.anchor) &&
        stillAnchored(cue.anchor, before.element);
      return { cue, element: reuse ? before.element : (resolveAnchor(cue.anchor)?.element ?? null) };
    });
    const elements = resolved.flatMap((entry) => (entry.element ? [entry.element] : []));
    this.resolved = resolved.map((entry) => ({
      ...entry,
      section: entry.element ? sectionOf(entry.element, elements) : null,
      docIndex: 0,
    }));
    this.resolved.sort((a, b) => {
      if (a.element && b.element) {
        if (a.element === b.element) return 0;
        return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      return a.element ? -1 : b.element ? 1 : 0;
    });
    this.resolved.forEach((entry, index) => (entry.docIndex = index));
    const starts = this.starts();
    const startOf = new Map(this.found().map((entry, index) => [entry.cue.id, starts[index]!.start]));
    this.resolved.sort((a, b) => {
      const sa = startOf.get(a.cue.id);
      const sb = startOf.get(b.cue.id);
      if (sa === undefined || sb === undefined) return sa === undefined ? (sb === undefined ? 0 : 1) : -1;
      return sa - sb || a.docIndex - b.docIndex;
    });
    this.scroller = primaryScroller(this.found().map((entry) => entry.element));
    this.sendState();
    // Never report while scrolling on the prompter's behalf: that would cut its smooth scroll short.
    if (this.guard.shouldBroadcast()) {
      this.lastPosition = null;
      this.reportPosition();
    }
    this.drawOverlay();
    this.importNewAttributes();
    this.checkHandoff();
  }

  /** Debounced re-resolve, with a maximum wait so a constantly changing page is still tracked. */
  private readonly scheduleResolve = (): void => {
    if (!this.connected) return;
    const now = performance.now();
    this.resolvePendingSince ??= now;
    window.clearTimeout(this.resolveTimer);
    const wait = Math.max(0, Math.min(RESOLVE_DEBOUNCE_MS, this.resolvePendingSince + RESOLVE_MAX_WAIT_MS - now));
    this.resolveTimer = window.setTimeout(() => {
      this.resolvePendingSince = undefined;
      this.resolve();
    }, wait);
  };

  private handleMutations(): void {
    this.scheduleResolve();
  }

  private found(): FoundCue[] {
    return this.resolved.filter((entry): entry is FoundCue => entry.section !== null);
  }

  /** Starts or stops the work that only matters while a prompter is connected. */
  private setTracking(on: boolean): void {
    if (on) {
      // Structural changes only: class and style churn (animations) would re-resolve constantly.
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [CUE_ATTRIBUTE, 'id', 'hidden'],
      });
      // Fallback for route changes the Navigation API and history events miss.
      this.pollTimer ??= window.setInterval(this.checkNavigation, URL_POLL_MS);
      this.bridgeTimer ??= window.setInterval(() => void this.pollBridge(), BRIDGE_POLL_MS);
      void this.pollBridge();
      if (window === window.top) this.handoffTimer ??= window.setInterval(() => this.checkHandoff(), HANDOFF_POLL_MS);
    } else {
      window.clearInterval(this.bridgeTimer);
      this.bridgeTimer = undefined;
      window.clearInterval(this.handoffTimer);
      this.handoffTimer = undefined;
      this.observer.disconnect();
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      window.clearTimeout(this.resolveTimer);
      this.resolvePendingSince = undefined;
    }
    this.updateOverlay();
  }

  /** When the page last scrolled, to tell an address that follows scrolling from a real move. */
  private lastScrollAt = -Infinity;

  /** URLs the page put in place with `history.replaceState` (or a replace navigation). */
  private readonly replacedUrls = new Set<string>();

  private readonly noteNavigation = (event: Event): void => {
    const navigation = event as Event & { navigationType?: string; destination?: { url?: string } };
    if (navigation.navigationType === 'replace' && navigation.destination?.url) {
      this.replacedUrls.add(navigation.destination.url);
      if (this.replacedUrls.size > 50) this.replacedUrls.clear();
    }
  };

  private readonly checkNavigation = (): void => {
    // A frame serves the tab's address, which the top frame watches.
    if (this.tab) return;
    if (!this.alive() || location.href === this.href) return;
    const before = new URL(this.href);
    this.href = location.href;
    if (siteKey(location.href) === this.key) return;
    // Pages that only rewrite their own address while you scroll (endless lists add ?p=2, ?p=3,
    // articles track the section) are still the same page: same path, replaced rather than pushed.
    // Keep its cues. A real move to another page pushes a new entry or changes the path.
    const replaced = this.replacedUrls.has(location.href);
    if (replaced && before.origin === location.origin && before.pathname === location.pathname) return;
    // Docs that put the section you scroll to in the path (`/api` becomes `/api/errors`) replace it
    // while you scroll: still the same page. Remember it, so a reload there finds these cues.
    if (replaced && before.origin === location.origin && performance.now() - this.lastScrollAt < SCROLL_RENAME_MS) {
      void setAlias(siteKey(location.href), this.key).catch(() => undefined);
      return;
    }
    if (this.role === 'host') {
      // Take the page back; if a frame still holds the content, it is handed over again.
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      this.role = 'main';
      this.handoff = null;
      void this.tabInfo(true);
    }
    void this.load();
  };

  // ---------------------------------------------------------------- position

  /**
   * Each found cue's start, in the current order. Side-by-side grouping (see `basePoints`) works on
   * document order, so the spans are measured in that order and mapped back.
   */
  private starts(): Start[] {
    const found = this.found();
    const shiftOf = (index: number): number | undefined =>
      this.draft?.index === index ? this.draft.shift : found[index]!.cue.startAt;
    const result: Start[] = new Array(found.length);
    const grouped = found
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !entry.cue.free)
      .sort((a, b) => a.entry.docIndex - b.entry.docIndex);
    const spans = grouped.map(({ entry }) => {
      const rect = entry.section.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    const points = startPoints(
      spans,
      grouped.map(({ index }) => shiftOf(index)),
    );
    grouped.forEach(({ index }, k) => (result[index] = points[k]!));
    // Cues added by hand start from their own element, outside any side-by-side row.
    found.forEach((entry, index) => {
      if (!entry.cue.free) return;
      const rect = entry.section.getBoundingClientRect();
      const height = Math.max(1, rect.height);
      result[index] = { base: rect.top, height, start: rect.top + (shiftOf(index) ?? 0) * height };
    });
    return result;
  }

  /** Each cue's start (its section's top, side-by-side sections sharing a row, plus adjustments). */
  private layout(starts = this.starts()): Layout {
    return { tops: keepApart(starts.map((point) => point.start)), end: contentEnd(this.scroller) };
  }

  private currentPosition(): CuePosition {
    const layout = this.layout();
    const line = readingLine(this.scroller);
    const position = positionAt(layout, line);
    // At the end of the page the last cues may never reach the line: promote the last visible one.
    return atEnd(this.scroller) ? promoteAtEnd(position, layout, viewportOf(this.scroller).bottom) : position;
  }

  // ---------------------------------------------------------------- section lines

  private updateOverlay(): void {
    const on = this.connected && this.linesWanted.size > 0;
    if (on && !this.overlay.visible) this.overlay.show();
    if (!on && this.overlay.visible) this.overlay.hide();
    this.drawOverlay();
  }

  private drawOverlay(): void {
    if (!this.overlay.visible) return;
    const tops = this.layout().tops;
    const marks: OverlayMark[] = this.found().map(({ cue }, index) => ({
      number: index + 1,
      title: cue.title,
      y: tops[index]!,
    }));
    const box = this.scroller.element?.getBoundingClientRect();
    const frame = {
      left: box ? box.left : 0,
      width: box ? this.scroller.element!.clientWidth : document.documentElement.clientWidth,
      end: contentEnd(this.scroller),
      rtl: getComputedStyle(document.body ?? document.documentElement).direction === 'rtl',
    };
    this.overlay.draw(marks, this.currentPosition().index, readingLine(this.scroller), frame);
  }

  private readonly scheduleOverlay = (): void => {
    if (!this.overlay.visible || this.overlayFrame) return;
    this.overlayFrame = requestAnimationFrame(() => {
      this.overlayFrame = 0;
      this.drawOverlay();
    });
  };

  private dragStart(index: number, y: number): void {
    const starts = this.starts();
    const tops = this.layout(starts).tops;
    this.draft = { index, shift: shiftFor(starts[index]!, y, tops[index - 1], tops[index + 1]) };
    this.drawOverlay();
    this.reportPosition();
  }

  private dropStart(index: number): void {
    if (this.draft?.index !== index) return;
    const { shift } = this.draft;
    this.setStart(index, shift);
  }

  /** Saves where a cue starts; the stored cue comes back through `watchSite` and is redrawn. */
  private setStart(index: number, shift: number): void {
    const entry = this.found()[index];
    if (!entry) return;
    // Keep the dragged position on screen until the saved cue arrives.
    this.cues = this.cues.map((cue) => (cue.id === entry.cue.id ? { ...cue, startAt: shift } : cue));
    entry.cue = { ...entry.cue, startAt: shift };
    this.draft = null;
    this.lastPosition = null;
    this.reportPosition();
    this.drawOverlay();
    void this.change(this.key, { kind: 'patch', id: entry.cue.id, patch: { startAt: shift }, at: Date.now() });
  }

  private reportPosition(): void {
    if (!this.connected) return;
    const position = this.currentPosition();
    if (!positionChanged(this.lastPosition, position)) return;
    this.lastPosition = position;
    this.broadcast({ type: 'position', position });
  }

  private readonly handleScroll = (): void => {
    this.lastScrollAt = performance.now();
    this.guard.noteScroll();
    this.scheduleOverlay();
    if (!this.connected || !this.guard.shouldBroadcast() || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.guard.shouldBroadcast()) this.reportPosition();
    });
  };

  private readonly handleScrollEnd = (): void => {
    const wasProgrammatic = this.guard.isProgrammatic();
    this.guard.settle();
    // Keep the last reported position in step after a programmatic scroll, without echoing it.
    if (wasProgrammatic && this.connected) this.lastPosition = this.currentPosition();
  };

  private readonly handleUserInput = (event: Event): void => {
    // Events a page script dispatches are not the presenter scrolling.
    if (!event.isTrusted) return;
    if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
    this.guard.noteUserInput();
  };

  private scrollTo(position: CuePosition, smooth: boolean): void {
    const layout = this.layout();
    const target = offsetOf(layout, position);
    if (target === null) return;
    const delta = target - readingLine(this.scroller);
    if (Math.abs(delta) < 1) return;
    this.guard.beginProgrammatic();
    scrollByAmount(this.scroller, delta, smooth);
    this.lastPosition = position;
  }

  /**
   * Adds a cue that starts exactly at the reading line: a new part of the page. It is anchored to
   * the block of text at the line (so it finds its place again at any window size), moved so its
   * start is the line itself, and saved; the prompter then opens it for writing.
   */
  private addCueHere(): void {
    const cue = this.addCueAt(readingLine(this.scroller), { title: '', notes: '' });
    this.broadcast(cue ? { type: 'cue-added', cue } : { type: 'add-failed' });
  }

  /**
   * Adds a cue that starts at viewport `y`: a new part of the page. It attaches to the part already
   * there (the cue current at `y`, whose element is found already, so nothing is searched); on a page
   * with no cues above `y`, to the block of text at `y`. Its start is moved to exactly `y`.
   */
  private addCueAt(y: number, words: { title: string; notes: string }, near?: Element): Cue | null {
    // The element at y keeps the cue in place when content above it loads or changes later; the part
    // already there (found, so nothing is searched) and the page itself are the fallbacks.
    const layout = this.layout();
    const reference = this.found()[positionAt(layout, y).index];
    const anchor = (near ? anchorNear(near)?.anchor : this.anchorAt(y)) ?? reference?.cue.anchor ?? this.pageAnchor();
    if (!anchor) return null;
    const now = Date.now();
    const cue: Cue = {
      id: newCueId(),
      anchor: { ...anchor },
      ...words,
      origin: 'local',
      free: true,
      createdAt: now,
      updatedAt: now,
    };
    this.cues = [...this.cues, cue];
    this.resolve();
    const index = this.found().findIndex((entry) => entry.cue.id === cue.id);
    if (index < 0) {
      this.cues = this.cues.filter((existing) => existing.id !== cue.id);
      this.resolve();
      return null;
    }
    // Start just above y (rounding must never put it below), so at the reading line it is current now.
    const start = this.starts()[index]!;
    cue.startAt = Math.floor(((y - 0.5 - start.base) / start.height) * 10000) / 10000;
    this.cues = this.cues.map((existing) => (existing.id === cue.id ? cue : existing));
    this.resolved = this.resolved.map((entry) => (entry.cue.id === cue.id ? { ...entry, cue } : entry));
    this.resolve();
    // An explicit action: always tell the prompter, even right after a scroll it did not see as the user's.
    this.lastPosition = null;
    this.reportPosition();
    void this.change(this.key, { kind: 'add', cue });
    return cue;
  }

  /**
   * Something to attach a new part to at viewport `y`, on a page with no cues above it. Text is often
   * not in the middle (a narrow column on the left, a sidebar layout), so several points across the
   * line are tried, then a little above and below it.
   */
  private anchorAt(y: number): Cue['anchor'] | undefined {
    const box = this.scroller.element?.getBoundingClientRect();
    const left = box?.left ?? 0;
    const width = box?.width ?? document.documentElement.clientWidth;
    // The smallest element wins: a cue's start is kept as a share of its element's height, so a big
    // container (all of the content) would move the start when content loads into it later.
    const small = window.innerHeight / 2;
    const deadline = performance.now() + 40;
    const seen = new Set<Element>();
    // Only what moves with the page's scrolling: not a sidebar with its own scrolling, nor a fixed
    // or sticky panel. The page's scrolling area is the one under the middle of the line.
    const middle = document.elementFromPoint(left + width / 2, y);
    const scrolling = this.scroller.element ?? (middle ? scrollParent(middle) : null);
    const moves = (element: Element): boolean => {
      if (scrollParent(element) !== scrolling) return false;
      for (let current: Element | null = element; current && current !== scrolling; current = current.parentElement) {
        const { position } = getComputedStyle(current);
        if (position === 'fixed' || position === 'sticky') return false;
      }
      return true;
    };
    let best: { anchor: Cue['anchor']; height: number } | undefined;
    for (const dy of [0, 24, -24, 64]) {
      for (const share of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1]) {
        const hit = document.elementFromPoint(left + width * share, y + dy);
        if (!hit || seen.has(hit) || hit.closest('pagecue-sections')) continue;
        seen.add(hit);
        if (!moves(hit)) continue;
        const found = anchorNear(hit);
        if (!found || !moves(found.element)) continue;
        // It must take room at the line: an empty or collapsed element gives no usable start.
        const rect = found.element.getBoundingClientRect();
        if (rect.height < 8 || rect.top > y + dy || rect.bottom < y + dy) continue;
        const height = rect.height;
        if (!best || height < best.height) best = { anchor: found.anchor, height };
        if (best.height <= small || performance.now() > deadline) return best.anchor;
      }
    }
    return best?.anchor;
  }

  /** The page itself, when it scrolls as a whole: a cue then starts at its own height on the page. */
  private pageAnchor(): Cue['anchor'] | undefined {
    const root = document.scrollingElement ?? document.documentElement;
    if (this.scroller.element || root.scrollHeight <= window.innerHeight + 40) return undefined;
    return { tag: 'body', selector: 'body' };
  }

  // ---------------------------------------------------------------- cue commands from Claude (bridge)

  /** Cue commands from Claude through the bridge (see `PrompterMessage` `api`). The prompter shows each change with Undo. */
  private runAgentCommand(method: string, args: unknown[]): unknown {
    const found = this.found();
    const pick = (ref: unknown): FoundCue => {
      const entry =
        typeof ref === 'number' ? found[ref - 1] : found.find((candidate) => candidate.cue.id === String(ref));
      if (!entry) throw new Error(`No cue ${JSON.stringify(ref)}. Call pagecue_status to see them.`);
      return entry;
    };
    const words = (value: unknown): { title?: string; notes?: string } => {
      const input = (value ?? {}) as { title?: unknown; notes?: unknown };
      const result: { title?: string; notes?: string } = {};
      if (input.title !== undefined) result.title = String(input.title).trim();
      if (input.notes !== undefined) {
        result.notes = Array.isArray(input.notes) ? input.notes.map(String).join('\n') : String(input.notes);
      }
      return result;
    };
    switch (method) {
      case 'add': {
        const input = (args[0] ?? {}) as { near?: unknown };
        const { title = '', notes = '' } = words(args[0]);
        if (!title && !notes) throw new Error('A cue needs a title or notes.');
        let y = readingLine(this.scroller);
        let element: Element | undefined;
        if (input.near !== undefined) {
          element = findByText(String(input.near));
          if (!element) throw new Error(`No visible text on the page matches ${JSON.stringify(input.near)}.`);
          y = element.getBoundingClientRect().top;
        }
        const cue = this.addCueAt(y, { title, notes }, element);
        if (!cue) throw new Error('Could not attach a cue there. Try near: with a heading’s exact text.');
        const number = this.found().findIndex((entry) => entry.cue.id === cue.id) + 1;
        this.broadcast({
          type: 'agent-change',
          text: `Added by Claude: “${title || 'a cue'}”`,
          undo: { kind: 'delete', id: cue.id },
        });
        return { number, id: cue.id };
      }
      case 'edit': {
        const entry = pick(args[0]);
        const patch = words(args[1]);
        const before = { title: entry.cue.title, notes: entry.cue.notes };
        void this.change(this.key, { kind: 'patch', id: entry.cue.id, patch, at: Date.now() });
        this.broadcast({
          type: 'agent-change',
          text: `Changed by Claude: “${patch.title ?? entry.cue.title}”`,
          undo: { kind: 'patch', id: entry.cue.id, patch: before, at: Date.now() + 1 },
        });
        return { id: entry.cue.id };
      }
      case 'remove': {
        const entry = pick(args[0]);
        void this.change(this.key, { kind: 'delete', id: entry.cue.id });
        this.broadcast({
          type: 'agent-change',
          text: `Deleted by Claude: “${entry.cue.title}”`,
          undo: { kind: 'import', cues: [entry.cue] },
        });
        return { id: entry.cue.id };
      }
      case 'show': {
        const entry = pick(args[0]);
        // Jump, then tell the prompter: unlike its own scrolls, it did not ask for this one.
        this.scrollTo({ index: found.indexOf(entry), progress: 0 }, false);
        this.lastPosition = null;
        this.reportPosition();
        this.drawOverlay();
        return { id: entry.cue.id };
      }
      default:
        throw new Error(`Unknown method ${method}.`);
    }
  }

  // ---------------------------------------------------------------- messaging

  /** Sends the cue list to the prompter; skipped when nothing changed, unless `force`. */
  private sendState(force = false): void {
    const cues: PageCueState[] = this.resolved.map(({ cue, element }) => ({
      id: cue.id,
      status: element ? 'found' : 'missing',
    }));
    const message: PageMessage = {
      type: 'state',
      siteKey: this.key,
      url: this.pageUrl(),
      title: this.pageTitle(),
      cues,
      siteFileError: this.siteFileError,
      frameAccess: this.frameAccess,
    };
    const serialized = JSON.stringify(message);
    if (!force && serialized === this.lastState) return;
    this.lastState = serialized;
    this.broadcast(message);
  }

  private broadcast(message: PageMessage): void {
    if (!this.alive()) return;
    for (const port of this.ports) port.postMessage(message);
  }

  private readonly handleConnect = (port: Browser.runtime.Port): void => {
    if (port.name !== PORT_NAME || this.role !== 'main' || !this.alive()) return;
    const first = !this.connected;
    this.ports.add(port);
    if (first) this.setTracking(true);
    port.onDisconnect.addListener(() => {
      this.ports.delete(port);
      this.linesWanted.delete(port);
      if (!this.connected) this.setTracking(false);
      else this.updateOverlay();
    });
    port.onMessage.addListener((message: PrompterMessage) => this.handlePrompterMessage(message, port));
  };

  private handlePrompterMessage(message: PrompterMessage, port: Browser.runtime.Port): void {
    switch (message.type) {
      case 'sync-request':
        this.checkNavigation();
        this.lastState = '';
        this.resolve();
        this.lastPosition = null;
        this.reportPosition();
        break;
      case 'scroll-to':
        this.scrollTo(message.position, message.smooth);
        break;
      case 'add-cue':
        this.addCueHere();
        break;
      case 'api':
        try {
          const result = this.runAgentCommand(message.method, Array.isArray(message.args) ? message.args : []);
          port.postMessage({ type: 'api-result', id: message.id, ok: true, result } satisfies PageMessage);
        } catch (error) {
          port.postMessage({
            type: 'api-result',
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies PageMessage);
        }
        break;
      case 'section-lines':
        if (message.on) this.linesWanted.add(port);
        else this.linesWanted.delete(port);
        this.updateOverlay();
        break;
    }
  }

  private readonly handleRuntimeMessage = (
    message: RuntimeMessage,
    _sender: unknown,
    reply: (value: PingReply) => void,
  ) => {
    if (message.type === 'ping' && this.role === 'main' && this.alive()) reply({ pagecue: true, siteKey: this.key });
    return false;
  };
}

const HEADINGS = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

/**
 * The element on the page that best matches `query` (whitespace and case ignored): a heading whose
 * text is exactly the query, then any element whose text is exactly it, then a heading containing
 * it, then the smallest element containing it. Pages repeat phrases (a summary at the top, the
 * section further down), and the heading is almost always the place meant.
 */
function findByText(query: string): Element | undefined {
  const wanted = normalizeText(query).toLowerCase();
  if (!wanted) return undefined;
  const visible = (element: Element): boolean =>
    !element.closest('script, style, noscript, pagecue-sections') && element.checkVisibility?.() !== false;
  const textOf = (element: Element): string => elementText(element, wanted.length + 400).toLowerCase();

  const headings = [...document.body.querySelectorAll(HEADINGS)].filter(visible);
  const exactHeading = headings.find((element) => textOf(element) === wanted);
  if (exactHeading) return exactHeading;

  let exact: Element | undefined;
  let containing: Element | undefined;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      !parent ||
      !normalizeText(node.nodeValue ?? '')
        .toLowerCase()
        .includes(wanted) ||
      !visible(parent)
    )
      continue;
    if (!exact && textOf(parent) === wanted) exact = parent;
    containing ??= parent;
  }
  if (exact) return exact;
  const headingContaining = headings.find((element) => textOf(element).includes(wanted));
  if (headingContaining) return headingContaining;
  if (containing) return containing;

  // Text split across elements (a sentence with a bold word): the smallest block that holds it all.
  let best: Element | undefined;
  for (const element of document.body.querySelectorAll('p,li,dt,dd,td,th,figcaption,blockquote')) {
    if (!visible(element) || !elementText(element, 2000).toLowerCase().includes(wanted)) continue;
    if (!best || (element.textContent ?? '').length < (best.textContent ?? '').length) best = element;
  }
  return best;
}
