import { describe, expect, it } from 'vitest';
import { CueFileError } from '../src/lib/cueFile';
import { parsePastedCues } from '../src/lib/paste';

describe('parsePastedCues', () => {
  it('reads the plain text format inside a code block, ignoring the chat’s introduction', () => {
    const cues = parsePastedCues(
      [
        'Here are your cues:',
        '```text',
        '## Revenue by region',
        '**Revenue up 24% in Q3**',
        '- EU drove most of it',
        '- Key number: 24%',
        '',
        '## Risks',
        'Two risks to watch',
        '* Hiring',
        '```',
        'Good luck!',
      ].join('\n'),
    );
    expect(cues.map((cue) => [cue.id, cue.title, cue.notes])).toEqual([
      ['revenue-by-region', 'Revenue up 24% in Q3', 'EU drove most of it\nKey number: 24%'],
      ['risks', 'Two risks to watch', 'Hiring'],
    ]);
    expect(cues[0]!.anchor).toEqual({ tag: '*', text: 'Revenue by region', heading: 'Revenue by region' });
  });

  it('keeps any language and makes ids unique', () => {
    const cues = parsePastedCues('## הכנסות\nההכנסות עלו\n- 24%\n## הכנסות\nשוב');
    expect(cues.map((cue) => cue.id)).toEqual(['הכנסות', 'הכנסות-2']);
    expect(cues[0]!.title).toBe('ההכנסות עלו');
  });

  it('uses the heading as the headline when there is none', () => {
    expect(parsePastedCues('## Next steps\n- Approve the hire')[0]!.title).toBe('Next steps');
  });

  it('reads JSON cue files, also without the version or as a bare array', () => {
    const file = '{"pagecue":1,"cues":[{"id":"a","near":"Intro","title":"Hello"}]}';
    expect(parsePastedCues(`\`\`\`json\n${file}\n\`\`\``)[0]!.anchor.text).toBe('Intro');
    expect(parsePastedCues('{"cues":[{"id":"a","title":"Hi",},]}')[0]!.id).toBe('a');
    expect(parsePastedCues('[{"id":"b","title":"Hi"}]')[0]!.anchor).toEqual({ cue: 'b', tag: '*' });
  });

  it('explains what is wrong', () => {
    expect(() => parsePastedCues('   ')).toThrow(CueFileError);
    expect(() => parsePastedCues('just some text')).toThrow(/## Heading/);
    expect(() => parsePastedCues('{"cues": [')).toThrow(/isn’t valid/);
  });
});
