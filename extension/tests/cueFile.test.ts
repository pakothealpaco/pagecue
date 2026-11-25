import { describe, expect, it } from 'vitest';
import { CueFileError, mergeSiteCues, parseCueFile, toCueFile } from '../src/lib/cueFile';
import type { Cue } from '../src/lib/types';

const NOW = 1_700_000_000_000;

describe('parseCueFile', () => {
  it('accepts the minimal agent-written form', () => {
    const cues = parseCueFile(
      { pagecue: 1, cues: [{ id: 'revenue', title: 'Revenue doubled', notes: ['EU deals', 'Ask: churn?'] }] },
      NOW,
    );
    expect(cues).toEqual([
      {
        id: 'revenue',
        anchor: { cue: 'revenue', tag: '*' },
        title: 'Revenue doubled',
        notes: 'EU deals\nAsk: churn?',
        origin: 'site',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it('accepts string and object anchors', () => {
    const [byName, full] = parseCueFile({
      pagecue: 1,
      cues: [
        { id: 'a', anchor: 'chart-1', title: 'A' },
        {
          id: 'b',
          anchor: { tag: 'section', selector: '#x', testId: { attr: 'data-testid', value: 't' } },
          title: 'B',
        },
      ],
    });
    expect(byName!.anchor).toEqual({ cue: 'chart-1', tag: '*' });
    expect(full!.anchor).toEqual({ tag: 'section', selector: '#x', testId: { attr: 'data-testid', value: 't' } });
  });

  it('explains what is wrong', () => {
    expect(() => parseCueFile({ pagecue: 2, cues: [] })).toThrow(/expected "pagecue": 1/);
    expect(() => parseCueFile({ pagecue: 1 })).toThrow(/"cues" array/);
    expect(() => parseCueFile({ pagecue: 1, cues: [{ title: 'x' }] })).toThrow(/cues\[0\] needs a non-empty "id"/);
    expect(() =>
      parseCueFile({
        pagecue: 1,
        cues: [
          { id: 'a', title: 'x' },
          { id: 'a', title: 'y' },
        ],
      }),
    ).toThrow(/duplicate id "a"/);
    expect(() => parseCueFile({ pagecue: 1, cues: [{ id: 'a', title: 'x', notes: 3 }] })).toThrow(CueFileError);
  });

  it('round-trips through export', () => {
    const cues = parseCueFile({ pagecue: 1, cues: [{ id: 'a', anchor: 'x', title: 'A', notes: ['one', 'two'] }] }, NOW);
    expect(parseCueFile(JSON.parse(JSON.stringify(toCueFile(cues, 'Report'))), NOW)).toEqual(cues);
  });
});

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

describe('mergeSiteCues', () => {
  it('updates site cues, keeps local edits, adds new ones and drops removed ones', () => {
    const stored = [
      cue('kept-edit', { title: 'my wording', editedLocally: true }),
      cue('updated', { title: 'old' }),
      cue('removed'),
      cue('mine', { origin: 'local' }),
    ];
    const fromSite = [
      cue('kept-edit', { title: 'site wording' }),
      cue('updated', { title: 'new', createdAt: 5 }),
      cue('added'),
    ];
    const merged = mergeSiteCues(stored, fromSite);

    expect(merged.map((c) => c.id)).toEqual(['kept-edit', 'updated', 'mine', 'added']);
    expect(merged[0]!.title).toBe('my wording');
    expect(merged[1]).toMatchObject({ title: 'new', createdAt: 1 });
  });

  it('returns the same objects when nothing changed', () => {
    const stored = [cue('a')];
    expect(mergeSiteCues(stored, [cue('a', { createdAt: 9, updatedAt: 9 })])[0]).toBe(stored[0]);
  });
});
