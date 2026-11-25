import { describe, expect, it } from 'vitest';
import { offsetOf, positionAt, positionChanged, promoteAtEnd, type Layout } from '../src/lib/position';

const layout: Layout = { tops: [100, 300, 400], end: 800 };

describe('positionAt', () => {
  it('is before the first cue above its top', () => {
    expect(positionAt(layout, 50)).toEqual({ index: -1, progress: 0 });
  });

  it('interpolates between cues', () => {
    expect(positionAt(layout, 100)).toEqual({ index: 0, progress: 0 });
    expect(positionAt(layout, 200)).toEqual({ index: 0, progress: 0.5 });
    expect(positionAt(layout, 350)).toEqual({ index: 1, progress: 0.5 });
  });

  it('runs the last span to the end of the content', () => {
    expect(positionAt(layout, 600)).toEqual({ index: 2, progress: 0.5 });
    expect(positionAt(layout, 5000)).toEqual({ index: 2, progress: 1 });
  });

  it('handles an empty layout', () => {
    expect(positionAt({ tops: [], end: 0 }, 10)).toEqual({ index: -1, progress: 0 });
  });

  it('handles cues at the same height', () => {
    expect(positionAt({ tops: [100, 100, 200], end: 300 }, 100).index).toBe(1);
  });
});

describe('offsetOf', () => {
  it('inverts positionAt', () => {
    for (const line of [100, 180, 300, 333, 400, 790]) {
      expect(offsetOf(layout, positionAt(layout, line))).toBeCloseTo(line);
    }
  });

  it('maps "before the first cue" to the first cue', () => {
    expect(offsetOf(layout, { index: -1, progress: 0 })).toBe(100);
  });

  it('clamps indexes past the end', () => {
    expect(offsetOf(layout, { index: 9, progress: 0 })).toBe(400);
  });

  it('carries a position across layouts of different sizes', () => {
    const page: Layout = { tops: [0, 1000, 3000], end: 4000 };
    const prompter: Layout = { tops: [0, 120, 240], end: 400 };
    const position = positionAt(page, 2000); // halfway between cue 1 and cue 2
    expect(offsetOf(prompter, position)).toBe(180);
  });
});

describe('promoteAtEnd', () => {
  it('promotes the last visible cue when the page cannot scroll further', () => {
    expect(promoteAtEnd({ index: 0, progress: 0.4 }, layout, 450)).toEqual({ index: 2, progress: 0 });
  });

  it('keeps the position when no later cue is visible', () => {
    expect(promoteAtEnd({ index: 2, progress: 0.1 }, layout, 450)).toEqual({ index: 2, progress: 0.1 });
  });
});

describe('positionChanged', () => {
  it('ignores tiny changes', () => {
    expect(positionChanged({ index: 1, progress: 0.5 }, { index: 1, progress: 0.505 })).toBe(false);
    expect(positionChanged({ index: 1, progress: 0.5 }, { index: 1, progress: 0.52 })).toBe(true);
    expect(positionChanged({ index: 1, progress: 0.5 }, { index: 2, progress: 0.5 })).toBe(true);
    expect(positionChanged(null, { index: 0, progress: 0 })).toBe(true);
  });
});
