import { describe, expect, it } from 'vitest';
import { coverageNeeded, frameAccess } from '../src/content/frames';

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

describe('coverageNeeded', () => {
  it('lets a Claude artifact in the panel beside a chat count as the page', () => {
    expect(coverageNeeded('https://7ddc6888.frame.claudeusercontent.com/_t?x=1')).toBeLessThan(0.5);
  });

  it('asks other frames to fill most of the window', () => {
    expect(coverageNeeded('https://www.youtube.com/embed/x')).toBe(0.6);
    expect(coverageNeeded('https://claudeusercontent.com.evil.example/x')).toBe(0.6);
    expect(coverageNeeded('about:blank')).toBe(0.6);
  });
});
