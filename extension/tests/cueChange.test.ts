import { describe, expect, it } from 'vitest';
import { applyCueChange } from '../src/lib/cueChange';
import type { Cue } from '../src/lib/types';

function cue(id: string, patch: Partial<Cue> = {}): Cue {
  return {
    id,
    anchor: { cue: id, tag: '*' },
    title: id,
    notes: '',
    origin: 'site',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe('applyCueChange', () => {
  it('adds a cue, replacing one with the same id', () => {
    const result = applyCueChange([cue('a'), cue('b')], { kind: 'add', cue: cue('a', { title: 'new' }) });
    expect(result.map((c) => [c.id, c.title])).toEqual([
      ['b', 'b'],
      ['a', 'new'],
    ]);
  });

  it('patches a site cue and marks it as edited here', () => {
    const [patched] = applyCueChange([cue('a')], { kind: 'patch', id: 'a', patch: { title: 'mine' }, at: 9 });
    expect(patched).toMatchObject({ title: 'mine', updatedAt: 9, editedLocally: true });
  });

  it('patches a local cue without marking it', () => {
    const [patched] = applyCueChange([cue('a', { origin: 'local' })], {
      kind: 'patch',
      id: 'a',
      patch: { notes: 'x' },
      at: 9,
    });
    expect(patched!.editedLocally).toBeFalsy();
  });

  it('deletes and imports', () => {
    expect(applyCueChange([cue('a'), cue('b')], { kind: 'delete', id: 'a' }).map((c) => c.id)).toEqual(['b']);
    const imported = applyCueChange([cue('a'), cue('b')], {
      kind: 'import',
      cues: [cue('b', { title: 'B2' }), cue('c')],
    });
    expect(imported.map((c) => [c.id, c.title])).toEqual([
      ['a', 'a'],
      ['b', 'B2'],
      ['c', 'c'],
    ]);
  });

  it('applies the site merge to the cues stored at that moment', () => {
    // The prompter added a local cue while the page was fetching its cue file.
    const stored = [cue('site-1'), cue('mine', { origin: 'local' })];
    const result = applyCueChange(stored, {
      kind: 'merge-site',
      cues: [cue('site-1', { title: 'v2' })],
      present: ['site-1'],
    });
    expect(result.map((c) => [c.id, c.title])).toEqual([
      ['site-1', 'v2'],
      ['mine', 'mine'],
    ]);
  });

  it('drops nothing when the site list is unknown', () => {
    const result = applyCueChange([cue('lazy-section')], { kind: 'merge-site', cues: [cue('new')], present: null });
    expect(result.map((c) => c.id)).toEqual(['lazy-section', 'new']);
  });
});
