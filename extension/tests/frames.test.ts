import { describe, expect, it } from 'vitest';
import { frameAccess } from '../src/content/frames';

describe('frameAccess', () => {
  it('covers a site whose frames get a new subdomain per document', () => {
    expect(frameAccess('https://7ddc6888.frame.claudeusercontent.com/_t?x=1')).toEqual({
      pattern: 'https://*.claudeusercontent.com/*',
      site: 'claudeusercontent.com',
    });
  });

  it('keeps country second-level domains whole', () => {
    expect(frameAccess('https://reports.example.co.uk/a')?.pattern).toBe('https://*.example.co.uk/*');
  });

  it('uses the exact host for bare hosts and addresses', () => {
    expect(frameAccess('http://localhost:5173/x')).toEqual({ pattern: 'http://localhost/*', site: 'localhost' });
    expect(frameAccess('http://127.0.0.1:8080/x')?.pattern).toBe('http://127.0.0.1/*');
    expect(frameAccess('https://example.com/x')?.pattern).toBe('https://example.com/*');
  });

  it('ignores frames pagecue cannot run in', () => {
    expect(frameAccess('about:blank')).toBeNull();
    expect(frameAccess('not a url')).toBeNull();
  });
});
