import { useCallback, useEffect, useState } from 'react';
import type { CueChange } from '../lib/cueChange';
import { getSite, listSites, requestChange, watchLibrary, watchSite } from '../lib/store';
import type { SiteRecord } from '../lib/types';

/** The stored record for one site key, kept live across every extension context. */
export function useSite(key: string | null, page: { title: string; url: string } | null) {
  const [record, setRecord] = useState<SiteRecord | undefined>();

  useEffect(() => {
    setRecord(undefined);
    if (!key) return;
    let alive = true;
    void getSite(key).then((value) => alive && setRecord(value));
    const unwatch = watchSite(key, (value) => alive && setRecord(value));
    return () => {
      alive = false;
      unwatch();
    };
  }, [key]);

  const change = useCallback(
    async (update: CueChange) => {
      if (!key) return;
      await requestChange(key, page ?? { title: '', url: '' }, update);
    },
    [key, page],
  );

  return { record, change };
}

/** Every site in the local database, newest first. */
export function useLibrary(): SiteRecord[] {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  useEffect(() => {
    const load = (): void => void listSites().then(setSites);
    load();
    return watchLibrary(load);
  }, []);
  return sites;
}
