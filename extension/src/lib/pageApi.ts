/**
 * `window.pagecue`: a small API in the page itself, for agents that work inside the browser tab
 * (such as Claude in Chrome) and cannot reach the extension. It exists only after the presenter turns
 * on "Let Claude in Chrome edit cues" in the prompter, and every call is checked again by the
 * content script, so turning the switch off stops it at once.
 *
 * Anything on the page can call it while it is on (a page script as well as an agent), which is
 * why it is off by default and shown as on in the prompter.
 *
 * Calls travel by `window.postMessage` between the page and pagecue's content script.
 */

export const PAGE_API_SOURCE = 'pagecue-page';
export const EXTENSION_SOURCE = 'pagecue-extension';

export type PageApiMethod = 'cues' | 'add' | 'edit' | 'remove' | 'show';

export interface PageApiRequest {
  source: typeof PAGE_API_SOURCE;
  id: string;
  method: PageApiMethod;
  args: unknown[];
}

export interface PageApiReply {
  source: typeof EXTENSION_SOURCE;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export const PAGE_API_HELP = `pagecue: presenter cues for this page, shown in the presenter's private prompter window.
Each cue covers a horizontal part of the page, from where it starts down to where the next cue starts.

  await pagecue.cues()
      List the cues in page order: [{ number, id, title, notes }].
  await pagecue.add({ title, notes, near })
      Add a cue. title: one short line (about 8 words). notes: up to three short points
      (an array of strings, or one string with a point per line).
      near: exact visible text on the page (a heading or the start of a paragraph) where the cue
      should start. Leave near out to start the cue at the reading line, about a third of the way
      down the window, so scroll that part of the page there first.
  await pagecue.edit(numberOrId, { title, notes })
      Change a cue's words.
  await pagecue.remove(numberOrId)
      Delete a cue.
  await pagecue.show(numberOrId)
      Scroll the page to a cue.

Write only facts from the page or from the presenter. Cues are private: the audience never sees them.`;

/**
 * Installs `window.pagecue` in the page's main world. Runs through `chrome.scripting.executeScript`
 * with `world: 'MAIN'`, so it must not use anything from outside its own body; the help text comes in
 * as an argument.
 */
export function installPageApi(help: string): void {
  const w = window as unknown as { pagecue?: unknown };
  if (w.pagecue) return;
  const call = (method: string, args: unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', onReply);
        reject(new Error('pagecue did not answer. Is the prompter open and connected to this page?'));
      }, 5000);
      const onReply = (event: MessageEvent): void => {
        const data = event.data as { source?: string; id?: string; ok?: boolean; result?: unknown; error?: string };
        if (event.source !== window || data?.source !== 'pagecue-extension' || data.id !== id) return;
        window.clearTimeout(timer);
        window.removeEventListener('message', onReply);
        if (data.ok) resolve(data.result);
        else reject(new Error(data.error));
      };
      window.addEventListener('message', onReply);
      window.postMessage({ source: 'pagecue-page', id, method, args }, '*');
    });
  const api = {
    help: (): string => help,
    cues: () => call('cues', []),
    add: (cue: unknown) => call('add', [cue]),
    edit: (ref: unknown, patch: unknown) => call('edit', [ref, patch]),
    remove: (ref: unknown) => call('remove', [ref]),
    show: (ref: unknown) => call('show', [ref]),
  };
  Object.defineProperty(window, 'pagecue', { value: Object.freeze(api), configurable: true });
}
