import { describe, expect, it } from 'vitest';
import { hyphenateEnglish } from '../src/core/english.ts';
import { breakFirstFit } from '../src/core/first-fit.ts';
import { textToItems } from '../src/core/items.ts';
import { breakKnuthPlass } from '../src/core/knuth-plass.ts';
import { isLegalBreak, prepare, score } from '../src/core/paragraph.ts';
import type { Item } from '../src/core/types.ts';
import { FROG_KING, mono, proportional, randomText } from './helpers.ts';

/** Tries every possible set of breaks. Hopeless beyond a few dozen words, which is the point. */
function bruteForce(items: Item[], lineWidth: number | ((l: number) => number), tolerance: number) {
  const legal: number[] = [];
  for (let i = 0; i < items.length - 1; i++) if (isLegalBreak(items, i)) legal.push(i);
  const p = prepare(items);
  const maxRatio = Math.cbrt(tolerance / 100);
  let best = Infinity;
  for (let mask = 0; mask < 1 << legal.length; mask++) {
    const breaks = legal.filter((_, k) => mask & (1 << k));
    breaks.push(items.length - 1);
    const r = score(p, breaks, lineWidth);
    if (r.ratios.every((x) => x >= -1 && x <= maxRatio) && r.demerits < best) best = r.demerits;
  }
  return best;
}

describe('Knuth–Plass', () => {
  it('finds the true optimum (checked against exhaustive search)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const items = textToItems(randomText(seed, 13), proportional);
      const width = 130 + (seed % 5) * 14;
      const best = bruteForce(items, width, 5000);
      if (!Number.isFinite(best)) continue;
      const result = breakKnuthPlass(items, { lineWidth: width, tolerance: 5000, emergencyStretch: 0 });
      expect(result.pass).toBe(1);
      expect(result.demerits).toBeCloseTo(best, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });

  it('finds the optimum with hyphenation in play', () => {
    const text = 'extraordinary typesetting considerably improves composition';
    const items = textToItems(text, proportional, { hyphenate: hyphenateEnglish });
    let checked = 0;
    for (const width of [150, 180, 210]) {
      const best = bruteForce(items, width, 5000);
      if (!Number.isFinite(best)) continue;
      const result = breakKnuthPlass(items, { lineWidth: width, tolerance: 5000, emergencyStretch: 0 });
      expect(result.demerits).toBeCloseTo(best, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('finds the optimum when every line has a different width', () => {
    let checked = 0;
    for (let seed = 50; seed < 75; seed++) {
      const items = textToItems(randomText(seed, 13), proportional);
      const width = (line: number) => 190 - line * 14;
      const best = bruteForce(items, width, 5000);
      if (!Number.isFinite(best)) continue;
      const result = breakKnuthPlass(items, { lineWidth: width, tolerance: 5000, emergencyStretch: 0 });
      expect(result.demerits).toBeCloseTo(best, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('never scores worse than first-fit', () => {
    for (let seed = 100; seed < 160; seed++) {
      const items = textToItems(randomText(seed, 80), proportional);
      const lineWidth = 180 + (seed % 7) * 25;
      const optimal = breakKnuthPlass(items, { lineWidth, tolerance: 10000 });
      const greedy = breakFirstFit(items, { lineWidth });
      if (greedy.overfull) continue;
      expect(optimal.demerits).toBeLessThanOrEqual(greedy.demerits + 1e-6);
    }
  });

  it('keeps every line within tolerance on real prose', () => {
    const items = textToItems(FROG_KING, proportional, { hyphenate: hyphenateEnglish });
    const result = breakKnuthPlass(items, { lineWidth: 300 });
    expect(result.pass).toBe(1);
    expect(result.overfull).toBe(false);
    for (const r of result.ratios) {
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(Math.cbrt(2) + 1e-9);
    }
  });

  it('reports one start and one ratio per line, ending at the forced break', () => {
    const items = textToItems(FROG_KING, proportional);
    const result = breakKnuthPlass(items, { lineWidth: 300 });
    expect(result.ratios).toHaveLength(result.breaks.length);
    expect(result.starts).toHaveLength(result.breaks.length);
    expect(result.breaks.at(-1)).toBe(items.length - 1);
    expect(result.starts[0]).toBe(0);
    expect([...result.breaks].sort((a, b) => a - b)).toEqual(result.breaks);
  });

  it('sets a short paragraph on a single line', () => {
    const items = textToItems('just a few words', mono);
    const result = breakKnuthPlass(items, { lineWidth: 40 });
    expect(result.breaks).toEqual([items.length - 1]);
    expect(result.ratios[0]).toBeCloseTo(0, 4);
  });

  it('handles an empty paragraph', () => {
    const items = textToItems('', mono);
    expect(breakKnuthPlass(items, { lineWidth: 40 }).breaks).toEqual([items.length - 1]);
  });

  it('avoids hyphenating two lines in a row when it has the choice', () => {
    const items = textToItems(FROG_KING, proportional, { hyphenate: hyphenateEnglish });
    for (const lineWidth of [200, 230, 260, 290]) {
      const eager = breakKnuthPlass(items, { lineWidth, flaggedDemerits: 0 });
      const careful = breakKnuthPlass(items, { lineWidth, flaggedDemerits: 1e7 });
      const doubles = (breaks: number[]) =>
        breaks.filter((b, i) => i > 0 && flagged(items[b]) && flagged(items[breaks[i - 1]])).length;
      expect(doubles(careful.breaks)).toBeLessThanOrEqual(doubles(eager.breaks));
    }
  });

  it('can be asked for a longer or shorter paragraph', () => {
    const items = textToItems(FROG_KING, proportional, { hyphenate: hyphenateEnglish });
    const lineWidth = 300;
    const natural = breakKnuthPlass(items, { lineWidth, tolerance: 2000 });
    const longer = breakKnuthPlass(items, { lineWidth, tolerance: 2000, looseness: 1 });
    expect(longer.breaks.length).toBe(natural.breaks.length + 1);
    expect(longer.demerits).toBeGreaterThanOrEqual(natural.demerits);
    // Asking for the impossible changes nothing.
    const shorter = breakKnuthPlass(items, { lineWidth, tolerance: 200, looseness: -5 });
    expect(shorter.breaks.length).toBeLessThanOrEqual(natural.breaks.length);
    expect(shorter.breaks.length).toBeGreaterThanOrEqual(natural.breaks.length - 5);
  });

  it('falls back to emergency stretch before giving up', () => {
    // Words too long to space politely in a narrow column, and no hyphenation.
    const items = textToItems(FROG_KING, proportional);
    const result = breakKnuthPlass(items, { lineWidth: 95, tolerance: 50 });
    expect(result.pass).toBeGreaterThan(1);
    expect(result.breaks.at(-1)).toBe(items.length - 1);
  });

  it('accepts an overfull line when a word is wider than the measure', () => {
    const items = textToItems('a pneumonoultramicroscopicsilicovolcanoconiosis b c d e f g', mono);
    const result = breakKnuthPlass(items, { lineWidth: 12 });
    expect(result.overfull).toBe(true);
    expect(result.pass).toBe(3);
    expect(result.breaks.at(-1)).toBe(items.length - 1);
  });

  it('survives a paragraph made of nothing but oversized words', () => {
    const items = textToItems('aaaaaaaaaaaa bbbbbbbbbbbb cccccccccccc', mono);
    const result = breakKnuthPlass(items, { lineWidth: 5 });
    expect(result.breaks).toHaveLength(3);
    expect(result.overfull).toBe(true);
  });

  it('is fast enough for a long chapter', () => {
    const items = textToItems(randomText(7, 20000), proportional);
    const t0 = performance.now();
    const result = breakKnuthPlass(items, { lineWidth: 400 });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(result.breaks.length).toBeGreaterThan(1000);
  });
});

describe('first-fit', () => {
  it('fills each line until the next word would not fit', () => {
    const items = textToItems(FROG_KING, mono);
    const lineWidth = 40;
    const result = breakFirstFit(items, { lineWidth });
    const p = prepare(items);
    result.breaks.slice(0, -1).forEach((end, i) => {
      const used = p.width[end] - p.width[result.starts[i]];
      expect(used).toBeLessThanOrEqual(lineWidth);
      // Width up to the end of the first word on the next line.
      const next = result.starts[i + 1];
      expect(p.width[next + 1] - p.width[result.starts[i]]).toBeGreaterThan(lineWidth);
    });
  });

  it('never shrinks a line', () => {
    const items = textToItems(FROG_KING, proportional);
    const result = breakFirstFit(items, { lineWidth: 240 });
    for (const r of result.ratios) expect(r).toBeGreaterThanOrEqual(0);
  });

  it('ignores discretionary hyphens unless told otherwise', () => {
    const items = textToItems(FROG_KING, proportional, { hyphenate: hyphenateEnglish });
    const plain = breakFirstFit(items, { lineWidth: 120 });
    expect(plain.breaks.some((b) => items[b].type === 'penalty' && items[b].width > 0)).toBe(false);
    const hyphenated = breakFirstFit(items, { lineWidth: 120, hyphens: true });
    expect(hyphenated.breaks.some((b) => items[b].type === 'penalty' && items[b].width > 0)).toBe(true);
  });

  it('puts an oversized word on a line of its own', () => {
    const items = textToItems('a bbbbbbbbbbbbbbbbbbbb c', mono);
    const result = breakFirstFit(items, { lineWidth: 6 });
    expect(result.breaks).toHaveLength(3);
    expect(result.overfull).toBe(true);
  });

  it('supports per-line widths', () => {
    const items = textToItems('aaaa bbbb cccc dddd eeee ffff', mono);
    const result = breakFirstFit(items, { lineWidth: (l) => (l === 0 ? 4 : 9) });
    expect(result.breaks).toHaveLength(4);
  });
});

function flagged(item: Item): boolean {
  return item.type === 'penalty' && item.flagged;
}
