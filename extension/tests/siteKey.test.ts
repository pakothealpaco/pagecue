import { describe, expect, it } from 'vitest';
import { originPattern, siteKey } from '../src/lib/siteKey';

describe('siteKey', () => {
  it('treats index.html and trailing slashes as the same page', () => {
    expect(siteKey('https://example.com/reports/')).toBe('https://example.com/reports');
    expect(siteKey('https://example.com/reports/index.html')).toBe('https://example.com/reports');
    expect(siteKey('https://example.com/index.html')).toBe('https://example.com/');
    expect(siteKey('https://example.com/')).toBe('https://example.com/');
  });

  it('keeps the port so local dev servers stay apart', () => {
    expect(siteKey('http://localhost:5173/')).not.toBe(siteKey('http://localhost:3000/'));
  });

  it('drops tracking parameters and sorts the rest', () => {
    expect(siteKey('https://x.io/d?b=2&utm_source=mail&a=1&fbclid=z')).toBe('https://x.io/d?a=1&b=2');
  });

  it('keeps hash routes and drops plain fragments', () => {
    expect(siteKey('https://app.io/#/billing')).toBe('https://app.io/#/billing');
    expect(siteKey('https://app.io/#!/billing')).toBe('https://app.io/#!/billing');
    expect(siteKey('https://app.io/page#section-2')).toBe('https://app.io/page');
  });

  it('keys local files by path', () => {
    expect(siteKey('file:///Users/me/report%20q3.html')).toBe('file:///Users/me/report q3.html');
  });
});

describe('originPattern', () => {
  it('covers every page and port of a host', () => {
    expect(originPattern('https://example.com/a/b?c=1')).toBe('https://example.com/*');
    expect(originPattern('http://localhost:5173/')).toBe('http://localhost/*');
  });

  it('is null for pages Chrome cannot grant by origin', () => {
    expect(originPattern('file:///tmp/a.html')).toBeNull();
  });
});
