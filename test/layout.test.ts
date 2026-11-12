import { describe, expect, it } from 'vitest';
import { hyphenateEnglish } from '../src/core/english.ts';
import { typeset } from '../src/core/index.ts';
import type { Line } from '../src/core/layout.ts';
import { justifyMono } from '../src/core/mono.ts';
import { findRivers } from '../src/core/rivers.ts';
import { block, circle, dropCap, taper } from '../src/core/shapes.ts';
import { FROG_KING, mono, proportional } from './helpers.ts';

const rightEdge = (line: Line) => {
  const last = line.runs[line.runs.length - 1];
  return last.x + last.width;
};

describe('layout', () => {
  it('makes every line but the last end exactly on the measure', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250, hyphenate: hyphenateEnglish });
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines.slice(0, -1)) expect(rightEdge(line)).toBeCloseTo(250, 6);
    const last = lines[lines.length - 1];
    expect(last.last).toBe(true);
    expect(rightEdge(last)).toBeLessThanOrEqual(250 + 1e-6);
  });

  it('does the same for first-fit', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250, algorithm: 'first-fit' });
    for (const line of lines.slice(0, -1)) expect(rightEdge(line)).toBeCloseTo(250, 6);
  });

  it('preserves every word in order', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250 });
    const words = lines.flatMap((l) => l.runs.map((r) => r.text));
    expect(words.join(' ')).toBe(FROG_KING);
  });

  it('adds the hyphen to a line broken inside a word', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 120, hyphenate: hyphenateEnglish });
    const broken = lines.filter((l) => l.hyphenated);
    expect(broken.length).toBeGreaterThan(0);
    for (const line of broken) expect(line.runs.at(-1)!.text.endsWith('-')).toBe(true);
    const rejoined = lines.map((l) => l.runs.map((r) => r.text).join(' ')).join(' ').replaceAll('- ', '');
    expect(rejoined.replaceAll('-', '')).toBe(FROG_KING.replaceAll('-', ''));
  });

  it('records gaps that tile the space between runs', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250 });
    for (const line of lines) {
      expect(line.gaps).toHaveLength(line.runs.length - 1);
      line.gaps.forEach((gap, i) => {
        expect(gap.x).toBeCloseTo(line.runs[i].x + line.runs[i].width, 6);
        expect(gap.x + gap.width).toBeCloseTo(line.runs[i + 1].x, 6);
      });
    }
  });

  it('leaves spaces natural when justification is off', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250, justify: false });
    for (const line of lines) for (const gap of line.gaps) expect(gap.width).toBeCloseTo(gap.natural, 9);
  });

  it('hangs punctuation outside the measure', () => {
    const text = '“Quoted,” she said, and so on and so forth, endlessly, with commas, everywhere, always.';
    const hung = typeset(text, { measure: mono, lineWidth: 18, hang: true }).lines;
    expect(hung[0].runs[0].x).toBeLessThan(0);
    expect(hung.slice(0, -1).some((l) => rightEdge(l) > 18 + 1e-9)).toBe(true);
    const flush = typeset(text, { measure: mono, lineWidth: 18 }).lines;
    expect(flush[0].runs[0].x).toBe(0);
    for (const l of flush.slice(0, -1)) expect(rightEdge(l)).toBeLessThanOrEqual(18 + 1e-9);
  });

  it('indents the first line only', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250, indent: 20 });
    expect(lines[0].runs[0].x).toBeCloseTo(20);
    expect(lines[1].runs[0].x).toBeCloseTo(0);
  });

  it('positions lines by line height and numbering', () => {
    const { lines } = typeset(FROG_KING, { measure: proportional, lineWidth: 250, lineHeight: 24, firstLine: 3 });
    expect(lines[0]).toMatchObject({ index: 3, y: 72 });
    expect(lines[1]).toMatchObject({ index: 4, y: 96 });
  });

  it('pours text into a shape', () => {
    const shape = circle(120, 16);
    const { lines } = typeset(FROG_KING, {
      measure: proportional,
      lineWidth: shape.width,
      lineOffset: shape.offset,
      tolerance: 2000,
    });
    for (const [i, line] of lines.slice(0, -1).entries()) {
      expect(line.width).toBeCloseTo(shape.width(i));
      expect(line.runs[0].x).toBeCloseTo(shape.offset(i), 6);
      expect(rightEdge(line)).toBeCloseTo(shape.offset(i) + shape.width(i), 5);
    }
  });
});

describe('shapes', () => {
  it('block is constant', () => {
    const s = block(300);
    expect([s.width(0), s.width(99), s.offset(5)]).toEqual([300, 300, 0]);
  });

  it('drop cap insets only the leading lines', () => {
    const s = dropCap(300, 3, 50);
    expect([0, 2, 3].map(s.width)).toEqual([250, 250, 300]);
    expect([0, 2, 3].map(s.offset)).toEqual([50, 50, 0]);
  });

  it('circle is symmetric and widest in the middle', () => {
    const s = circle(100, 20);
    expect(s.width(0)).toBeCloseTo(s.width(9));
    expect(s.width(4)).toBeGreaterThan(s.width(1));
    expect(s.width(4)).toBeLessThanOrEqual(200);
    for (let i = 0; i < 10; i++) expect(s.offset(i) + s.width(i) / 2).toBeCloseTo(100);
    // Past the bottom of the disc it falls back to the minimum rather than vanishing.
    expect(s.width(50)).toBe(40);
  });

  it('taper interpolates and stays centred', () => {
    const s = taper(300, 100, 5);
    expect(s.width(0)).toBe(300);
    expect(s.width(4)).toBe(100);
    expect(s.width(10)).toBe(100);
    expect(s.offset(4)).toBe(100);
  });
});

describe('rivers', () => {
  const line = (index: number, gaps: [number, number][]): Line => ({
    index, x: 0, y: index, width: 100, ratio: 1, runs: [], hyphenated: false, last: false,
    gaps: gaps.map(([x, width]) => ({ x, width, natural: 4 })),
  });

  it('finds gaps stacked over three or more lines', () => {
    const rivers = findRivers([
      line(0, [[30, 8], [70, 8]]),
      line(1, [[32, 8], [50, 8]]),
      line(2, [[29, 8], [80, 8]]),
      line(3, [[10, 8]]),
    ]);
    expect(rivers).toHaveLength(1);
    expect(rivers[0].links.map((l) => l.line)).toEqual([0, 1, 2]);
  });

  it('ignores gaps that are not stretched', () => {
    const tight = [0, 1, 2, 3].map((i) => line(i, [[30, 4]]));
    expect(findRivers(tight)).toHaveLength(0);
  });

  it('does not join across a missing line', () => {
    const rivers = findRivers([line(0, [[30, 8]]), line(1, [[30, 8]]), line(3, [[30, 8]]), line(4, [[30, 8]])]);
    expect(rivers).toHaveLength(0);
  });

  it('respects minLines', () => {
    const lines = [line(0, [[30, 8]]), line(1, [[30, 8]])];
    expect(findRivers(lines)).toHaveLength(0);
    expect(findRivers(lines, { minLines: 2 })).toHaveLength(1);
  });

  it('finds fewer rivers in total-fit than first-fit across many measures', () => {
    let optimal = 0;
    let greedy = 0;
    for (let lineWidth = 170; lineWidth <= 330; lineWidth += 10) {
      const base = { measure: proportional, lineWidth };
      optimal += findRivers(typeset(FROG_KING, { ...base, hyphenate: hyphenateEnglish }).lines).length;
      greedy += findRivers(typeset(FROG_KING, { ...base, algorithm: 'first-fit' }).lines).length;
    }
    expect(optimal).toBeLessThan(greedy);
  });
});

describe('justifyMono', () => {
  it('fills every line to the exact width except the last', () => {
    for (const width of [36, 48, 60, 72]) {
      const lines = justifyMono(FROG_KING, width, { hyphenate: hyphenateEnglish });
      for (const l of lines.slice(0, -1)) expect(l).toHaveLength(width);
      expect(lines.at(-1)!.length).toBeLessThanOrEqual(width);
    }
  });

  it('keeps the words intact', () => {
    const lines = justifyMono(FROG_KING, 50);
    expect(lines.join(' ').split(/\s+/)).toEqual(FROG_KING.split(' '));
  });

  it('separates paragraphs with a blank line', () => {
    const lines = justifyMono('one two three\n\nfour five six', 20);
    expect(lines).toEqual(['one two three', '', 'four five six']);
  });

  it('spreads extra spaces rather than piling them up', () => {
    const lines = justifyMono(FROG_KING, 44);
    for (const l of lines.slice(0, -1)) {
      const gaps = l.match(/ +/g)!.map((g) => g.length);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    }
  });
});
