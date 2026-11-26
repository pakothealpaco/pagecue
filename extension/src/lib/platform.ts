/** Whether this computer is a Mac, where shortcuts use ⌘ rather than Ctrl. */
export const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

/** A ⌘ (Mac) or Ctrl (Windows, Linux) shortcut, written the way this computer's keyboard shows it. */
export function modKey(key: string, mac = isMac): string {
  if (!mac) return `Ctrl+${key}`;
  return key.length > 1 ? `⌘ ${key}` : `⌘${key}`;
}
