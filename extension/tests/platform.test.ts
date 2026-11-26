import { describe, expect, it } from 'vitest';
import { modKey } from '../src/lib/platform';

describe('modKey', () => {
  it('writes ⌘ on a Mac', () => {
    expect(modKey('+', true)).toBe('⌘+');
    expect(modKey('Enter', true)).toBe('⌘ Enter');
  });
  it('writes Ctrl on Windows and Linux', () => {
    expect(modKey('−', false)).toBe('Ctrl+−');
    expect(modKey('Enter', false)).toBe('Ctrl+Enter');
  });
});
