import { browser, type Browser } from 'wxt/browser';
import { injectInto, registerSite, unregisterSite, upgradeRegistrations } from '../lib/access';
import type { MainFrameReply, MainFrameRequest, RuntimeMessage } from '../lib/protocol';
import {
  SESSION_MAIN_FRAMES,
  SESSION_PROMPTER_WINDOW,
  SESSION_TARGET,
  type MainFrames,
  type Target,
} from '../lib/session';
import { commitChange, commitRename, type ChangeRequest, type RenameRequest } from '../lib/store';

const PROMPTER_SIZE = { width: 440, height: 820 };

/** Largest cue file pagecue reads from a page. Real ones are a few kilobytes. */
const MAX_CUE_FILE_BYTES = 1_000_000;

let opening: Promise<void> | null = null;

/** Focuses the prompter window, or opens it. Concurrent calls share one window. */
function openPrompter(): Promise<void> {
  opening ??= (async () => {
    const stored = await browser.storage.session.get(SESSION_PROMPTER_WINDOW);
    const existing = stored[SESSION_PROMPTER_WINDOW] as number | undefined;
    if (existing !== undefined) {
      try {
        await browser.windows.update(existing, { focused: true, drawAttention: true });
        return;
      } catch {
        // The window was closed; open a new one.
      }
    }
    const created = await browser.windows.create({
      url: browser.runtime.getURL('/prompter.html'),
      type: 'popup',
      ...PROMPTER_SIZE,
    });
    await browser.storage.session.set({ [SESSION_PROMPTER_WINDOW]: created?.id });
  })().finally(() => {
    opening = null;
  });
  return opening;
}

type FetchReply = { ok: true; text: string } | { ok: false; error: string };

/**
 * Fetches the cue file a page links to, for that page's content script. Only same-origin files
 * are read, so a page cannot use pagecue to request URLs it could not request itself.
 */
async function fetchCueFile(url: string, sender: Browser.runtime.MessageSender): Promise<FetchReply> {
  const pageUrl = sender.tab?.url;
  if (!pageUrl || sender.id !== browser.runtime.id) return { ok: false, error: 'not sent by a page' };
  const target = new URL(url);
  const page = new URL(pageUrl);
  if (target.protocol === 'file:') {
    return {
      ok: false,
      error:
        'Chrome does not let extensions read linked files on pages opened from disk. Put the cues inline (<script type="application/vnd.pagecue+json">) or use ⋯ → Import cues.',
    };
  }
  if (target.origin !== page.origin) return { ok: false, error: 'the cue file must be on the same site as the page' };
  try {
    const response = await fetch(target, { credentials: 'include', cache: 'no-cache' });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_CUE_FILE_BYTES) return { ok: false, error: 'the cue file is larger than 1 MB' };
    const text = await response.text();
    if (text.length > MAX_CUE_FILE_BYTES) return { ok: false, error: 'the cue file is larger than 1 MB' };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The local pagecue bridge (the Claude Code plugin's server), where agents publish cues. */
const BRIDGE = __PAGECUE_BRIDGE__;

interface BridgeEntry {
  publishedAt: number;
  cueFile: unknown;
}

/** Cues an agent published for a site, or null when there are none or no bridge is running. */
async function fetchBridgeCues(key: string): Promise<BridgeEntry | null> {
  try {
    const response = await fetch(`${BRIDGE}/v1/cues?key=${encodeURIComponent(key)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const entry = (await response.json()) as BridgeEntry;
    return typeof entry?.publishedAt === 'number' ? entry : null;
  } catch {
    return null;
  }
}

type BackgroundRequest =
  | RuntimeMessage
  | ChangeRequest
  | RenameRequest
  | { type: 'fetch-cue-file'; url: string }
  | { type: 'fetch-bridge-cues'; key: string }
  | MainFrameRequest
  | { type: 'inject-frames' };

/** Records which frame of a tab shows its page, so the prompter connects there. */
async function setMainFrame(tabId: number, frameId: number | undefined): Promise<void> {
  const stored = await browser.storage.session.get(SESSION_MAIN_FRAMES);
  const frames = { ...((stored[SESSION_MAIN_FRAMES] as MainFrames | undefined) ?? {}) };
  if (frames[tabId] === frameId) return;
  if (frameId === undefined) delete frames[tabId];
  else frames[tabId] = frameId;
  await browser.storage.session.set({ [SESSION_MAIN_FRAMES]: frames });
}

export default defineBackground(() => {
  // Toolbar button: connect the current tab (temporary access) and bring up the prompter.
  browser.action.onClicked.addListener(async (tab) => {
    let tabId: number | null = null;
    if (tab.id !== undefined) {
      try {
        await injectInto(tab.id);
        tabId = tab.id;
      } catch {
        // Browser pages (chrome://, the Web Store, the PDF viewer) cannot be scripted.
      }
    }
    const target: Target = { tabId, at: Date.now() };
    await browser.storage.session.set({ [SESSION_TARGET]: target });
    await openPrompter();
  });

  void upgradeRegistrations().catch(() => undefined);
  browser.tabs.onRemoved.addListener((tabId) => void setMainFrame(tabId, undefined));

  browser.windows.onRemoved.addListener(async (windowId) => {
    const stored = await browser.storage.session.get(SESSION_PROMPTER_WINDOW);
    if (stored[SESSION_PROMPTER_WINDOW] === windowId) await browser.storage.session.remove(SESSION_PROMPTER_WINDOW);
  });

  // Keyboard shortcuts work even while the shared site window has focus.
  browser.commands.onCommand.addListener((command) => {
    if (command === 'next-cue' || command === 'previous-cue') {
      const message: RuntimeMessage = { type: 'step', delta: command === 'next-cue' ? 1 : -1 };
      browser.runtime.sendMessage(message).catch(() => undefined);
    }
  });

  browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, reply) => {
    if (sender.id !== browser.runtime.id) return false;
    if (message.type === 'fetch-cue-file') {
      void fetchCueFile(message.url, sender).then(reply);
      return true; // keep the channel open for the async reply
    }
    if (message.type === 'fetch-bridge-cues') {
      void fetchBridgeCues(message.key).then(reply);
      return true;
    }
    if (message.type === 'main-frame') {
      const tab = sender.tab;
      if (tab?.id === undefined) return false;
      const claimed = message.claim ? setMainFrame(tab.id, sender.frameId ?? 0) : Promise.resolve();
      void claimed.then(() => reply({ url: tab.url ?? '', title: tab.title ?? '' } satisfies MainFrameReply));
      return true;
    }
    if (message.type === 'inject-frames') {
      // A page whose content is in a frame (see `content/frames.ts`) asks for pagecue in its frames.
      if (sender.tab?.id === undefined || sender.frameId !== 0) return false;
      void injectInto(sender.tab.id).then(
        () => reply({ ok: true }),
        () => reply({ ok: false }),
      );
      return true;
    }
    if (message.type === 'site-rename') {
      void commitRename(message).then(
        () => reply({ ok: true }),
        (error: unknown) => reply({ ok: false, error: String(error) }),
      );
      return true;
    }
    if (message.type === 'cue-change') {
      void commitChange(message).then(
        () => reply({ ok: true }),
        (error: unknown) => reply({ ok: false, error: String(error) }),
      );
      return true;
    }
    return false;
  });

  // Sites granted from Chrome's own site-access menu work like remembered sites.
  browser.permissions.onAdded.addListener(async ({ origins }) => {
    for (const pattern of origins ?? []) await registerSite(pattern);
  });
  browser.permissions.onRemoved.addListener(async ({ origins }) => {
    for (const pattern of origins ?? []) await unregisterSite(pattern).catch(() => undefined);
  });
});
