import { describe, expect, it } from 'vitest';
import { sectionOf } from '../src/content/region';
import { basePoints, breakpoints, MIN_GAP, positionAt, shiftFor, startPoints } from '../src/lib/position';

describe('sectionOf', () => {
  it('widens a heading cue to the largest block that holds no other cue', () => {
    document.body.innerHTML = `
      <main>
        <div class="row">
          <div class="col" id="a"><img alt=""><h2>Qi2</h2><p>Fast.</p></div>
          <div class="col" id="b"><img alt=""><h2>ChillBoost</h2><p>Cool.</p></div>
        </div>
        <section id="c"><figure></figure><h2>Design</h2><p>Recycled.</p></section>
      </main>`;
    const headings = [...document.querySelectorAll('h2')];
    expect(sectionOf(headings[0]!, headings).id).toBe('a');
    expect(sectionOf(headings[1]!, headings).id).toBe('b');
    expect(sectionOf(headings[2]!, headings).id).toBe('c');
  });

  it('keeps an element the author marked exactly as it is', () => {
    document.body.innerHTML = '<section><figure data-pagecue="chart"></figure><p>More</p></section>';
    const figure = document.querySelector('figure')!;
    expect(sectionOf(figure, [figure])).toBe(figure);
  });

  it('never widens past the body', () => {
    document.body.innerHTML = '<h2>Only cue</h2><p>Text</p>';
    const heading = document.querySelector('h2')!;
    expect(sectionOf(heading, [heading])).toBe(heading);
  });
});

describe('breakpoints', () => {
  const spans = [
    { top: 0, bottom: 400 },
    { top: 500, bottom: 900 },
    { top: 500, bottom: 900 }, // side by side with the previous one
    { top: 1000, bottom: 1400 },
  ];

  it('starts each section at its top', () => {
    expect(basePoints([spans[0]!, spans[3]!])).toEqual([0, 1000]);
  });

  it('splits a row of side-by-side sections so only one cue is current', () => {
    const points = basePoints(spans);
    expect(points).toEqual([0, 500, 700, 1000]);
    const layout = { tops: points, end: 1400 };
    expect(positionAt(layout, 600).index).toBe(1);
    expect(positionAt(layout, 750).index).toBe(2);
    expect(positionAt(layout, 950).index).toBe(2);
  });

  it('keeps a cue current until the next cue starts, across gaps', () => {
    const layout = { tops: basePoints(spans), end: 1400 };
    expect(positionAt(layout, 450).index).toBe(0);
  });

  it('moves a start by a share of its section', () => {
    expect(breakpoints(spans, [0, 0, 0, 0.25])).toEqual([0, 500, 700, 1100]);
    expect(breakpoints(spans, [0, -0.5])).toEqual([0, 300, 700, 1000]);
  });

  it('never lets starts cross', () => {
    const points = breakpoints(spans, [0, 0, 0, -2]);
    expect(points[3]).toBe(700 + MIN_GAP);
  });

  it('turns a drag into a shift kept between the neighbours', () => {
    const points = breakpoints(spans);
    const start = startPoints(spans)[3]!;
    expect(shiftFor(start, 1200, points[2])).toBe(0.5);
    // Dragged above the previous start: stops just below it.
    const shift = shiftFor(start, 100, points[2]);
    expect(breakpoints(spans, [0, 0, 0, shift])[3]).toBe(700 + MIN_GAP);
  });
});
