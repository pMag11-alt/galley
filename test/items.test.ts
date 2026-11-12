import { describe, expect, it } from 'vitest';
import { hyphenateEnglish } from '../src/core/english.ts';
import { FILL, textToItems } from '../src/core/items.ts';
import { INFINITY, type Box, type Penalty } from '../src/core/types.ts';
import { mono, proportional } from './helpers.ts';

describe('textToItems', () => {
  it('alternates boxes and glue for plain words', () => {
    const items = textToItems('a bc def', mono);
    expect(items.slice(0, 5).map((i) => i.type)).toEqual(['box', 'glue', 'box', 'glue', 'box']);
    expect(items.slice(0, 5).map((i) => i.width)).toEqual([1, 1, 2, 1, 3]);
  });

  it('finishes with a guarded fill and a forced break', () => {
    const items = textToItems('word', mono);
    const [guard, fill, end] = items.slice(-3);
    expect(guard).toMatchObject({ type: 'penalty', cost: INFINITY });
    expect(fill).toMatchObject({ type: 'glue', width: 0, stretch: FILL });
    expect(end).toMatchObject({ type: 'penalty', cost: -INFINITY });
  });

  it('collapses runs of whitespace and ignores the edges', () => {
    const a = textToItems('  one \n\t two  ', mono);
    const b = textToItems('one two', mono);
    expect(a).toEqual(b);
  });

  it('returns just the ending for empty text', () => {
    expect(textToItems('   ', mono)).toHaveLength(3);
  });

  it('inserts flagged hyphen penalties between syllables', () => {
    const items = textToItems('typesetting', mono, { hyphenate: hyphenateEnglish });
    const boxes = items.filter((i): i is Box => i.type === 'box').map((b) => b.text);
    const hyphens = items.filter((i): i is Penalty => i.type === 'penalty' && i.width > 0);
    expect(boxes).toEqual(['type', 'set', 'ting']);
    expect(hyphens).toHaveLength(2);
    expect(hyphens.every((h) => h.flagged && h.text === '-' && h.cost === 50)).toBe(true);
  });

  it('makes the pieces of a word add up to the whole word', () => {
    const word = 'william';
    const items = textToItems(word, proportional, { hyphenate: hyphenateEnglish });
    const total = items.filter((i) => i.type === 'box').reduce((s, b) => s + b.width, 0);
    expect(total).toBeCloseTo(proportional(word), 9);
  });

  it('allows a free break after an explicit hyphen', () => {
    const items = textToItems('lime-tree', mono);
    expect(items.slice(0, 3)).toMatchObject([
      { type: 'box', text: 'lime-' },
      { type: 'penalty', width: 0, flagged: true },
      { type: 'box', text: 'tree' },
    ]);
  });

  it('allows a break after an em dash but does not count it as a hyphen', () => {
    const items = textToItems('wait—what', mono);
    expect(items.slice(0, 3)).toMatchObject([
      { type: 'box', text: 'wait—' },
      { type: 'penalty', width: 0, flagged: false },
      { type: 'box', text: 'what' },
    ]);
  });

  it('does not break at a leading or trailing hyphen', () => {
    const items = textToItems('-x y-', mono);
    expect(items.filter((i) => i.type === 'penalty')).toHaveLength(2);
  });

  it('adds an empty box for the indent', () => {
    const items = textToItems('word', mono, { indent: 4 });
    expect(items[0]).toEqual({ type: 'box', width: 4, text: '' });
  });

  it('marks punctuation for hanging only when asked', () => {
    const plain = textToItems('“yes,”', mono)[0] as Box;
    expect(plain.lp).toBeUndefined();
    const hung = textToItems('“yes,”', mono, { hang: true })[0] as Box;
    expect(hung.lp).toBeCloseTo(0.5);
    expect(hung.rp).toBeCloseTo(0.5);
    const comma = textToItems('yes,', mono, { hang: true })[0] as Box;
    expect(comma.rp).toBeCloseTo(0.7);
    expect(comma.lp).toBeUndefined();
  });

  it('uses the requested elasticity for spaces', () => {
    const glue = textToItems('a b', mono, { spaceStretch: 1, spaceShrink: 0 })[1];
    expect(glue).toEqual({ type: 'glue', width: 1, stretch: 1, shrink: 0 });
  });
});
