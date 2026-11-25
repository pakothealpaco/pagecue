import { useEffect, useState } from 'react';

/** True once the pointer and keyboard have been still for `ms`. Used to fade the window chrome. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = (): void => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const;
    for (const type of events) window.addEventListener(type, wake, { passive: true });
    const leave = (): void => setIdle(true);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.clearTimeout(timer);
      for (const type of events) window.removeEventListener(type, wake);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [ms]);

  return idle;
}
