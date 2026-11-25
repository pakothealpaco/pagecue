import { beforeEach, describe, expect, it } from 'vitest';
import { anchorNear, describeElement, nearestHeading, resolveAnchor } from '../src/lib/anchor';

const REPORT = `
  <main>
    <h1>Quarterly report</h1>
    <section id="summary"><h2>Summary</h2><p>Revenue grew 24% in Q3, driven by new EU customers.</p></section>
    <section class="block"><h2>Costs</h2><p>Cloud costs rose after the migration in March.</p></section>
    <section class="block" data-testid="churn"><h2>Churn</h2><p>Churn fell to 2.1% after onboarding changes.</p></section>
    <figure data-pagecue="revenue-chart"><figcaption>Revenue by month</figcaption></figure>
    <div data-pagecue="twice"></div><div data-pagecue="twice"></div>
  </main>`;

beforeEach(() => {
  document.body.innerHTML = REPORT;
});

const $ = (selector: string): Element => document.querySelector(selector)!;

describe('resolveAnchor', () => {
  it('finds the element a site marked with data-pagecue', () => {
    expect(resolveAnchor({ cue: 'revenue-chart', tag: '*' })?.element).toBe($('figure'));
  });

  it('does not guess when a data-pagecue value is used twice', () => {
    expect(resolveAnchor({ cue: 'twice', tag: '*' })).toBeNull();
  });

  it('falls back to id, test id and selector, in that order', () => {
    expect(resolveAnchor({ tag: 'section', id: 'summary' })).toMatchObject({ by: 'id', element: $('#summary') });
    expect(resolveAnchor({ tag: 'section', testId: { attr: 'data-testid', value: 'churn' } })?.by).toBe('testId');
    expect(resolveAnchor({ tag: 'section', selector: 'main > section:nth-of-type(2)' })?.element).toBe(
      $('section:nth-of-type(2)'),
    );
  });

  it('rejects a structural match whose text changed completely', () => {
    const anchor = {
      tag: 'section',
      id: 'summary',
      text: 'Summary Revenue grew 24% in Q3, driven by new EU customers.',
    };
    $('#summary').innerHTML = '<h2>Legal</h2><p>Terms and conditions apply to all plans.</p>';
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it('finds a reworded element through the fuzzy text match', () => {
    const anchor = {
      tag: 'section',
      selector: 'section.gone',
      text: 'Costs Cloud costs rose after the migration in March.',
      heading: 'Costs',
    };
    $('section:nth-of-type(2) p').textContent = 'Cloud costs rose after the migration in April.';
    const resolution = resolveAnchor(anchor);
    expect(resolution?.by).toBe('text');
    expect(resolution?.element).toBe($('section:nth-of-type(2)'));
  });

  it('returns null instead of guessing when nothing matches', () => {
    expect(resolveAnchor({ tag: 'section', text: 'A paragraph that never existed anywhere' })).toBeNull();
  });
});

describe('labels', () => {
  it('describes an element by its heading or caption', () => {
    expect(describeElement($('#summary'))).toBe('Summary');
    expect(describeElement($('figure'))).toBe('Revenue by month');
  });

  it('finds the nearest preceding heading', () => {
    expect(nearestHeading($('figure'))).toBe('Churn');
  });
});

describe('anchorNear', () => {
  it('anchors to the nearest block with enough text, one that resolves back to itself', () => {
    document.body.innerHTML = `
      <section><h2>Revenue</h2><p>Revenue grew strongly in the third quarter. <b>EU</b> led.</p></section>
      <section><h2>Costs</h2><p>Costs rose after the migration and then flattened.</p></section>`;
    const bold = document.querySelector('b')!;
    const near = anchorNear(bold)!;
    expect(near.element.tagName).toBe('P');
    expect(near.anchor.heading).toBe('Revenue');
    expect(resolveAnchor(near.anchor)?.element).toBe(near.element);
  });
});
