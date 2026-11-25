import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCueFile } from '../src/lib/cueFile';

// The JSON Schema ships with the Claude Code plugin; the extension's parser must accept what it describes.
const root = resolve(__dirname, '../..');
const schema = JSON.parse(readFileSync(resolve(root, 'plugins/pagecue/schema/pagecue.schema.json'), 'utf8'));

describe('cue file schema', () => {
  it('has examples the extension accepts', () => {
    expect(schema.examples.length).toBeGreaterThan(0);
    for (const example of schema.examples) expect(() => parseCueFile(example)).not.toThrow();
  });

  it('pins the same format version as the extension', () => {
    expect(schema.properties.pagecue.const).toBe(1);
  });

  it('accepts the end-to-end fixture', () => {
    const fixture = JSON.parse(readFileSync(resolve(__dirname, '../e2e/fixtures/report.cues.json'), 'utf8'));
    expect(parseCueFile(fixture)).toHaveLength(4);
  });
});
