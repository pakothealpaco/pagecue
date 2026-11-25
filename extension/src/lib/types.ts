/**
 * Core data model shared by the content script and the prompter.
 *
 * A *cue* is a short speaker note attached to one element of a page.
 * Cues are stored per *site key* (see `siteKey.ts`).
 */

/** How a cue finds its element again. Every field is optional except `tag`; the resolver tries them in a fixed order. */
export interface Anchor {
  /** Value of a `data-pagecue` attribute the site ships. The strongest anchor. */
  cue?: string;
  /** A stable element id (generated-looking ids are never stored). */
  id?: string;
  /** A test id (`data-testid`, `data-test`, `data-cy`, `data-qa`). */
  testId?: { attr: string; value: string };
  /** A unique CSS selector generated when the cue was created. */
  selector?: string;
  /** Normalised start of the element's text, used to verify and to fuzzy-match. */
  text?: string;
  /** Text of the nearest heading before the element, a tie-breaker for fuzzy matches. */
  heading?: string;
  /** Lower-case tag name of the element. */
  tag: string;
}

export interface Cue {
  id: string;
  anchor: Anchor;
  /** One glanceable line, about eight words. */
  title: string;
  /** Speaker notes; each non-empty line is shown as one bullet. */
  notes: string;
  /**
   * Moves where the cue starts on the page, as a share of its section's height (0.5: half a
   * section later, -0.25: a quarter earlier). Set by dragging its line on the page.
   */
  startAt?: number;
  /**
   * Added by hand at a point on the page: it starts at its element's top plus `startAt`, and never
   * shares a row with side-by-side sections.
   */
  free?: boolean;
  /** Where the cue came from: written in the prompter, or imported from a site's cue file. */
  origin: 'local' | 'site';
  /** Set when a cue that came from a site file was edited here, so a newer site file does not overwrite it. */
  editedLocally?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SiteRecord {
  key: string;
  /** Last seen page title and URL, for the library list. */
  title: string;
  url: string;
  /** The presenter's own name for the site, shown instead of the page title. */
  name?: string;
  cues: Cue[];
  updatedAt: number;
}

/** Where a cue currently is on the page, as reported by the content script. */
export type CueStatus = 'found' | 'missing';

export interface PageCueState {
  id: string;
  status: CueStatus;
}

/**
 * A position in the cue sequence: `index` is the current cue (the last one whose start is at or above the reading line),
 * `progress` (0..1) is how far the reading line is towards the next cue.
 * `index` is -1 before the first cue.
 */
export interface CuePosition {
  index: number;
  progress: number;
}
