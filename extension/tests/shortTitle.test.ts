import { describe, expect, it } from 'vitest';
import { shortTitle } from '../src/lib/store';

describe('shortTitle', () => {
  it('drops the site name after a separator', () => {
    expect(shortTitle('Women’s accessories have landed | SHOP X')).toBe('Women’s accessories have landed');
    expect(shortTitle('SHOP X — Women’s accessories')).toBe('Women’s accessories');
  });
  it('keeps titles without a separator, and hyphens inside words', () => {
    expect(shortTitle('Q3 business review')).toBe('Q3 business review');
    expect(shortTitle('Single-page app')).toBe('Single-page app');
  });
});
