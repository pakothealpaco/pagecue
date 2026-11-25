import { browser } from 'wxt/browser';

/**
 * Site access. pagecue asks for nothing at install time. It reaches a page in two ways:
 * - **Once:** clicking the toolbar button grants `activeTab` for that tab until it navigates away.
 * - **Always:** "Remember site" asks Chrome for access to that origin and registers the content
 *   script for it, so the page reconnects by itself after every reload.
 */
export const CONTENT_SCRIPT = '/content-scripts/content.js';

const scriptId = (pattern: string): string => `pagecue:${pattern}`;

/** Must be called from a user gesture (a click) in an extension page. */
export async function rememberSite(pattern: string): Promise<boolean> {
  const granted = await browser.permissions.request({ origins: [pattern] });
  if (!granted) return false;
  await registerSite(pattern);
  return true;
}

/**
 * Registers the content script for a site. Idempotent: the prompter and the background worker's
 * `permissions.onAdded` listener may both call it for the same grant.
 */
export async function registerSite(pattern: string): Promise<void> {
  const id = scriptId(pattern);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) {
    // Registered by an older version, for the top frame only.
    if (!existing[0]!.allFrames)
      await browser.scripting.updateContentScripts([{ id, js: [CONTENT_SCRIPT], allFrames: true }]);
    return;
  }
  try {
    await browser.scripting.registerContentScripts([
      {
        id,
        matches: [pattern],
        js: [CONTENT_SCRIPT],
        runAt: 'document_idle',
        // Frames too: some pages show their content inside a frame (see `content/frames.ts`).
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
    if (!registered.length) throw error;
  }
}

export async function unregisterSite(pattern: string): Promise<void> {
  const id = scriptId(pattern);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [id] });
}

/** Stops auto-connecting to a site and gives its access back to Chrome. */
export async function forgetSite(pattern: string): Promise<void> {
  await unregisterSite(pattern);
  await browser.permissions.remove({ origins: [pattern] });
}

export async function isRemembered(pattern: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [pattern] });
}

/**
 * Injects the content script now, into the page and every frame pagecue may access. Safe to call
 * twice: the script ignores a second load.
 */
export async function injectInto(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT] });
}

/** Updates sites remembered by older versions, whose content script ran in the top frame only. */
export async function upgradeRegistrations(): Promise<void> {
  const scripts = await browser.scripting.getRegisteredContentScripts();
  const old = scripts.filter((script) => script.id.startsWith('pagecue:') && !script.allFrames);
  if (old.length)
    await browser.scripting.updateContentScripts(old.map(({ id }) => ({ id, js: [CONTENT_SCRIPT], allFrames: true })));
}
