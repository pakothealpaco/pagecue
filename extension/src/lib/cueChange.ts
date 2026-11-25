import { mergeSiteCues } from './cueFile';
import type { Anchor, Cue } from './types';

/**
 * Every way a site's cues can change, as plain data. Changes are sent to the background worker,
 * which applies them one at a time per site, so the page and the prompter never overwrite each
 * other's writes (see `store.ts`).
 */
export type CueChange =
  /** The site's own cues, from its cue file and `data-pagecue` attributes. */
  | { kind: 'merge-site'; cues: Cue[]; present: string[] | null }
  | { kind: 'add'; cue: Cue }
  | {
      kind: 'patch';
      id: string;
      patch: Partial<{ title: string; notes: string; anchor: Anchor; startAt: number }>;
      at: number;
    }
  | { kind: 'delete'; id: string }
  /** Cues imported from a file replace cues with the same id. */
  | { kind: 'import'; cues: Cue[] };

export function applyCueChange(cues: readonly Cue[], change: CueChange): Cue[] {
  switch (change.kind) {
    case 'merge-site':
      return mergeSiteCues(cues, change.cues, change.present ? new Set(change.present) : null);
    case 'add':
      return [...cues.filter((cue) => cue.id !== change.cue.id), change.cue];
    case 'patch':
      return cues.map((cue) =>
        cue.id === change.id
          ? {
              ...cue,
              ...change.patch,
              updatedAt: change.at,
              // A site cue edited here is the presenter's now; a newer site file must not overwrite it.
              editedLocally: cue.origin === 'site' || cue.editedLocally,
            }
          : cue,
      );
    case 'delete':
      return cues.filter((cue) => cue.id !== change.id);
    case 'import': {
      const ids = new Set(change.cues.map((cue) => cue.id));
      return [...cues.filter((cue) => !ids.has(cue.id)), ...change.cues];
    }
  }
}
