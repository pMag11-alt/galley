import { describe, expect, it } from 'vitest';
import { hyphenateEnglish } from '../src/core/english.ts';
import { createHyphenator } from '../src/core/hyphenate.ts';

const split = (w: string) => hyphenateEnglish(w).join('-');

describe('Liang hyphenation', () => {
  it('breaks common words where a dictionary would', () => {
    expect(split('hyphenation')).toBe('hy-phen-ation');
    expect(split('typesetting')).toBe('type-set-ting');
    expect(split('beautiful')).toBe('beau-ti-ful');
    expect(split('algorithm')).toBe('al-go-rithm');
    expect(split('computer')).toBe('com-puter');
    expect(split('paragraph')).toBe('para-graph');
  });

  it('prefers the exception list to the patterns', () => {
    expect(split('associate')).toBe('as-so-ciate');
    expect(split('table')).toBe('ta-ble');
    expect(split('project')).toBe('project');
    expect(split('present')).toBe('present');
  });

  it('leaves at least two letters before and three after a break', () => {
    for (const word of ['abacus', 'idea', 'eerie', 'opened', 'again', 'every', 'amazing', 'elaborate']) {
      const parts = hyphenateEnglish(word);
      expect(parts.join('')).toBe(word);
      if (parts.length > 1) {
        expect(parts[0].length).toBeGreaterThanOrEqual(2);
        expect(parts[parts.length - 1].length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps the original capitalisation', () => {
    expect(split('Hyphenation')).toBe('Hy-phen-ation');
    expect(split('TYPESETTING')).toBe('TYPE-SET-TING');
  });

  it('refuses anything that is not purely letters, and very short words', () => {
    expect(hyphenateEnglish('x86_64')).toEqual(['x86_64']);
    expect(hyphenateEnglish("don't")).toEqual(["don't"]);
    expect(hyphenateEnglish('the')).toEqual(['the']);
    expect(hyphenateEnglish('')).toEqual(['']);
  });

  it('always reassembles to the input', () => {
    const words = 'extraordinary circumstances notwithstanding the representative acknowledged responsibility'.split(' ');
    for (const w of words) expect(hyphenateEnglish(w).join('')).toBe(w);
  });

  describe('with hand-written patterns', () => {
    it('lets the highest score win, odd meaning break', () => {
      // "a1b" wants a break between a and b; "a2bc" overrules it before "bc".
      const h = createHyphenator('a1b a2bc', { leftMin: 1, rightMin: 1 });
      expect(h('abab')).toEqual(['a', 'ba', 'b']);
      expect(h('abcab')).toEqual(['abca', 'b']);
    });

    it('anchors dotted patterns to the word edge', () => {
      const h = createHyphenator('.un1 1ing.', { leftMin: 1, rightMin: 1 });
      expect(h('undoing')).toEqual(['un', 'do', 'ing']);
      expect(h('sunning')).toEqual(['sunn', 'ing']);
    });

    it('honours leftMin and rightMin', () => {
      const h = createHyphenator('1a 1b 1c 1d 1e 1f', { leftMin: 2, rightMin: 3 });
      expect(h('abcdef')).toEqual(['ab', 'c', 'def']);
    });

    it('accepts underscore as the edge marker too', () => {
      const h = createHyphenator('_re1', { leftMin: 1, rightMin: 1 });
      expect(h('redo')).toEqual(['re', 'do']);
    });
  });
});
