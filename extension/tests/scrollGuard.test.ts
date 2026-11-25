import { describe, expect, it } from 'vitest';
import { ScrollGuard } from '../src/lib/scrollGuard';

function clock() {
  let time = 0;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe('ScrollGuard', () => {
  it('broadcasts user scrolls', () => {
    const guard = new ScrollGuard(clock().now);
    guard.noteScroll();
    expect(guard.shouldBroadcast()).toBe(true);
  });

  it('stays quiet during a programmatic scroll and for a moment after it settles', () => {
    const time = clock();
    const guard = new ScrollGuard(time.now, 150, 1200);
    guard.beginProgrammatic();
    time.advance(100);
    guard.noteScroll();
    expect(guard.shouldBroadcast()).toBe(false);
    guard.settle();
    time.advance(149);
    expect(guard.shouldBroadcast()).toBe(false);
    time.advance(2);
    expect(guard.shouldBroadcast()).toBe(true);
  });

  it('keeps a long smooth scroll quiet past the maximum while scroll events keep coming', () => {
    const time = clock();
    const guard = new ScrollGuard(time.now, 150, 300);
    guard.beginProgrammatic();
    for (let i = 0; i < 10; i += 1) {
      time.advance(100);
      guard.noteScroll();
      expect(guard.shouldBroadcast()).toBe(false);
    }
  });

  it('gives up after the maximum when no scroll happens', () => {
    const time = clock();
    const guard = new ScrollGuard(time.now, 150, 1200);
    guard.beginProgrammatic();
    time.advance(1201);
    expect(guard.shouldBroadcast()).toBe(true);
  });

  it('lets user input take over at once', () => {
    const time = clock();
    const guard = new ScrollGuard(time.now);
    guard.beginProgrammatic();
    guard.noteUserInput();
    expect(guard.shouldBroadcast()).toBe(true);
  });
});
