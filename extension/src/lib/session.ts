/** `chrome.storage.session` keys shared by the background worker and the prompter window. */

/**
 * The tab the toolbar button was last clicked on. `at` changes on every click, so clicking again
 * on the same tab still tells the prompter to reconnect.
 */
export const SESSION_TARGET = 'target';

export interface Target {
  /** null when the button was clicked on a page Chrome does not let extensions script. */
  tabId: number | null;
  at: number;
}

/** The prompter's window id, so the toolbar button focuses it instead of opening a second one. */
export const SESSION_PROMPTER_WINDOW = 'prompterWindowId';

/**
 * For each tab, the frame that shows its page: 0 (the top frame) unless the page's content lives in
 * a frame (see `content/frames.ts`). The prompter connects to that frame.
 */
export const SESSION_MAIN_FRAMES = 'mainFrames';

export type MainFrames = Record<string, number>;
