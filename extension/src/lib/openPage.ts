import { browser } from 'wxt/browser';
import { siteKey } from './siteKey';

/** Brings a tab and its window to the front, then puts the calling window (the prompter) back on top. */
export async function showTab(tabId: number): Promise<void> {
  const prompter = await browser.windows.getCurrent();
  const tab = await browser.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
  if (prompter.id !== undefined) await browser.windows.update(prompter.id, { focused: true });
}

/** The tab showing `url` (by site key), or a new tab for it in the browser window. Returns the tab id. */
export async function openPage(url: string): Promise<number> {
  const key = siteKey(url);
  const open = (await browser.tabs.query({})).find((tab) => {
    try {
      return tab.id !== undefined && !!tab.url && siteKey(tab.url) === key;
    } catch {
      return false;
    }
  });
  if (open?.id !== undefined) return open.id;
  const window = await browser.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => undefined);
  const tab = await browser.tabs.create({ url, active: true, windowId: window?.id });
  if (tab.id === undefined) throw new Error('Chrome did not open the page.');
  return tab.id;
}
