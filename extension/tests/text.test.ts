import { describe, expect, it } from 'vitest';
import { normalizeText, similarity, textDirection } from '../src/lib/text';

describe('normalizeText', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeText('  Revenue \n\t by   quarter ')).toBe('Revenue by quarter');
  });
});

describe('similarity', () => {
  it('is 1 for identical text and 0 for unrelated text', () => {
    expect(similarity('Revenue by quarter', 'Revenue by quarter')).toBe(1);
    expect(similarity('Revenue by quarter', 'zzzz')).toBe(0);
  });

  it('stays high for small edits', () => {
    expect(similarity('Revenue grew 24% in Q3', 'Revenue grew 26% in Q3')).toBeGreaterThan(0.85);
  });

  it('is low for different sentences of similar length', () => {
    expect(similarity('Revenue grew in Q3', 'Churn fell after launch')).toBeLessThan(0.4);
  });

  it('handles very short strings without dividing by zero', () => {
    expect(similarity('a', 'b')).toBe(0);
    expect(similarity('', '')).toBe(1);
  });

  it('works for Hebrew text', () => {
    expect(similarity('הכנסות עלו', 'הכנסות עלו הרבה')).toBeGreaterThan(0.7);
  });
});

describe('textDirection', () => {
  it('follows the majority of letters, not the first one', () => {
    expect(textDirection('ChillBoost מקרר את הטלפון בטעינה')).toBe('rtl');
    expect(textDirection('Qi2: אלחוטי במהירות')).toBe('rtl');
    expect(textDirection('Revenue up 24% ברבעון')).toBe('ltr');
    expect(textDirection('Revenue up 24% in Q3')).toBe('ltr');
    expect(textDirection('25W 15W')).toBe('ltr');
  });
});

describe('scripts', () => {
  it('reads direction from the letters of any script', async () => {
    const { textDirection } = await import('../src/lib/text');
    expect(textDirection('النمو 24% في الربع الثالث')).toBe('rtl');
    expect(textDirection('Qi2 چارج سریع')).toBe('rtl');
    expect(textDirection('收入增长24%，主要来自欧洲')).toBe('ltr');
    expect(textDirection('Выручка выросла на 24%')).toBe('ltr');
  });

  it('tags the scripts that need their own fonts', async () => {
    const { scriptLanguage } = await import('../src/lib/text');
    expect(scriptLanguage('收入增长24%，主要来自欧洲')).toBe('zh');
    expect(scriptLanguage('売上は24%増加しました')).toBe('ja');
    expect(scriptLanguage('매출이 24% 증가했습니다')).toBe('ko');
    expect(scriptLanguage('النمو في الربع الثالث')).toBe('ar');
    expect(scriptLanguage('राजस्व में 24% की वृद्धि')).toBe('hi');
    expect(scriptLanguage('รายได้เพิ่มขึ้น 24%')).toBe('th');
    expect(scriptLanguage('הכנסות עלו ב-24%')).toBe('he');
    expect(scriptLanguage('Revenue up 24% in Q3')).toBeUndefined();
    expect(scriptLanguage('Выручка выросла')).toBeUndefined();
  });
});
