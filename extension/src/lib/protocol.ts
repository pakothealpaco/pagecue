import type { CueChange } from './cueChange';
import type { FrameAccess } from '../content/frames';
import type { Cue, CuePosition, PageCueState } from './types';

/**
 * Messages on the port between the prompter window and a page's content script.
 * The prompter opens the port with `chrome.tabs.connect(tabId, { name: PORT_NAME })`.
 */
export const PORT_NAME = 'pagecue';

export type PrompterMessage =
  /** Ask the page for its full state (sent on connect and after the prompter reloads). */
  | { type: 'sync-request' }
  /** Scroll the page so this cue position is at the reading line. */
  | { type: 'scroll-to'; position: CuePosition; smooth: boolean }
  /** Show or hide section lines on the page (see `content/overlay.ts`). */
  | { type: 'section-lines'; on: boolean }
  /** A cue command from Claude through the bridge: add, edit, remove or show a cue. */
  | { type: 'api'; id: string; method: string; args: unknown[] }
  /** Add a cue (a new part of the page) starting at the reading line. */
  | { type: 'add-cue' };

export type PageMessage =
  | {
      type: 'state';
      siteKey: string;
      url: string;
      title: string;
      /** Cues in page order (found ones sorted by position, then missing ones). */
      cues: PageCueState[];
      /** A problem reading the site's own cue file, shown to the presenter. */
      siteFileError?: string;
      /**
       * The page's content is inside a frame from another site that pagecue may not read yet (see
       * `content/frames.ts`). The prompter offers to ask Chrome for access.
       */
      frameAccess?: FrameAccess;
    }
  | { type: 'position'; position: CuePosition }
  /** A cue was added at the reading line (from the prompter or the page); the prompter opens it for editing. */
  | { type: 'cue-added'; cue: Cue }
  /** Claude changed a cue through the bridge; the prompter says so, with undo. */
  | { type: 'agent-change'; text: string; undo: CueChange }
  /** The answer to an `api` command. */
  | { type: 'api-result'; id: string; ok: boolean; result?: unknown; error?: string }
  /** Nothing on the page at the reading line could hold a cue. */
  | { type: 'add-failed' };

/** One-off messages between extension pages, the background worker and content scripts. */
export type RuntimeMessage =
  | { type: 'ping' }
  /** From the background worker to the prompter: keyboard shortcut for the previous or next cue. */
  | { type: 'step'; delta: 1 | -1 };

/**
 * From a content script to the background worker: this frame now shows the tab's page (the top
 * frame, or a frame the page's content lives in). The worker records which frame the prompter
 * should talk to and answers with the tab's address and title.
 */
export interface MainFrameRequest {
  type: 'main-frame';
  /** False only asks for the tab's address and title, without moving the prompter here. */
  claim: boolean;
}

export interface MainFrameReply {
  url: string;
  title: string;
}

export interface PingReply {
  pagecue: true;
  siteKey: string;
}
