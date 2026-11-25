import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

export const TEXT_SIZES = { S: 0.88, M: 1, L: 1.15, XL: 1.3 } as const;
export type TextSize = keyof typeof TEXT_SIZES;
export type Theme = 'system' | 'dark' | 'light';

export interface Settings {
  textSize: TextSize;
  theme: Theme;
  /** Draw where each cue starts on the page itself. Visible to anyone who sees the page. */
  sectionLines: boolean;
  /** The first-use tip (scroll sync, double-click to edit) was dismissed or is no longer needed. */
  tipSeen: boolean;
  /** The "viewers see section lines" note was shown once. */
  linesExplained: boolean;
}

const KEY = 'prompter-settings';
const DEFAULTS: Settings = {
  textSize: 'M',
  theme: 'system',
  sectionLines: false,
  tipSeen: false,
  linesExplained: false,
};
export const TEXT_SIZE_ORDER = Object.keys(TEXT_SIZES) as TextSize[];
const ORDER = TEXT_SIZE_ORDER;

/** One step bigger or smaller, clamped to the ends of the scale. */
export function stepTextSize(current: TextSize, delta: 1 | -1): TextSize {
  const index = Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(current) + delta));
  return ORDER[index]!;
}

/** Prompter settings, saved in the extension's local storage. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    void browser.storage.local.get(KEY).then((value) => {
      const stored = value[KEY] as Partial<Settings> | undefined;
      setSettings({
        textSize: stored?.textSize && stored.textSize in TEXT_SIZES ? stored.textSize : DEFAULTS.textSize,
        theme: stored?.theme ?? DEFAULTS.theme,
        sectionLines: stored?.sectionLines === true,
        tipSeen: stored?.tipSeen === true,
        linesExplained: stored?.linesExplained === true,
      });
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void browser.storage.local.set({ [KEY]: next });
      return next;
    });
  }, []);

  return [settings, update];
}
