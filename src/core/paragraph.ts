import { INFINITY, type BreakResult, type Item } from './types.ts';

/**
 * A paragraph with running totals, so the natural width, stretch and shrink
 * of any candidate line come out in constant time.
 */
export interface Paragraph {
  items: Item[];
  width: Float64Array;
  stretch: Float64Array;
  shrink: Float64Array;
}

export interface LineMetrics {
  width: number;
  stretch: number;
  shrink: number;
}

export interface Scoring {
  linePenalty: number;
  flaggedDemerits: number;
  fitnessDemerits: number;
}

export const DEFAULT_SCORING: Scoring = {
  linePenalty: 10,
  flaggedDemerits: 3000,
  fitnessDemerits: 10000,
};

export function prepare(items: Item[]): Paragraph {
  const n = items.length;
  const width = new Float64Array(n + 1);
  const stretch = new Float64Array(n + 1);
  const shrink = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    width[i + 1] = width[i] + (it.type === 'penalty' ? 0 : it.width);
    stretch[i + 1] = stretch[i] + (it.type === 'glue' ? it.stretch : 0);
    shrink[i + 1] = shrink[i] + (it.type === 'glue' ? it.shrink : 0);
  }
  return { items, width, stretch, shrink };
}

export function isForcedBreak(item: Item): boolean {
  return item.type === 'penalty' && item.cost <= -INFINITY;
}

/** A line may end at glue that follows a box, or at any penalty that is not prohibitive. */
export function isLegalBreak(items: Item[], i: number): boolean {
  const it = items[i];
  if (it.type === 'penalty') return it.cost < INFINITY;
  return it.type === 'glue' && i > 0 && items[i - 1].type === 'box';
}

/** Where the next line starts: glue and penalties straight after a break are discarded. */
export function startAfter(items: Item[], breakAt: number): number {
  let i = breakAt + 1;
  while (i < items.length && items[i].type !== 'box' && !isForcedBreak(items[i])) i++;
  return i;
}

/** Natural dimensions of the line that starts at item `start` and breaks at item `end`. */
export function measureLine(p: Paragraph, start: number, end: number): LineMetrics {
  const { items } = p;
  const last = items[end];
  let width = p.width[end] - p.width[start];

  const first = items[start];
  if (first?.type === 'box' && first.lp) width -= first.lp;

  if (last.type === 'penalty' && last.width > 0) {
    width += last.width - (last.rp ?? 0);
  } else {
    const before = items[end - 1];
    if (end - 1 >= start && before?.type === 'box' && before.rp) width -= before.rp;
  }

  return {
    width,
    stretch: p.stretch[end] - p.stretch[start],
    shrink: p.shrink[end] - p.shrink[start],
  };
}

/** How far the glue must stretch (positive) or shrink (negative) for the line to hit `target`. */
export function adjustmentRatio(m: LineMetrics, target: number, extraStretch = 0): number {
  const gap = target - m.width;
  if (Math.abs(gap) < 1e-9) return 0;
  if (gap > 0) {
    const stretch = m.stretch + extraStretch;
    return stretch > 0 ? gap / stretch : Infinity;
  }
  return m.shrink > 0 ? gap / m.shrink : -Infinity;
}

/** Badness as TeX defines it, capped so that hopeless lines stay comparable. */
export function badness(ratio: number): number {
  const r = Math.abs(ratio);
  return r > 46 ? 1e7 : 100 * r * r * r;
}

/** Lines are sorted into four classes so a tight line next to a loose one can be penalised. */
export function fitnessClass(ratio: number): number {
  if (ratio < -0.5) return 0;
  if (ratio <= 0.5) return 1;
  if (ratio <= 1) return 2;
  return 3;
}

export function lineDemerits(
  scoring: Scoring,
  ratio: number,
  end: Item,
  previousFlagged: boolean,
  previousFitness: number,
): number {
  const base = scoring.linePenalty + badness(ratio);
  let d = base * base;
  if (end.type === 'penalty') {
    if (end.cost > 0) d += end.cost * end.cost;
    else if (end.cost > -INFINITY) d -= end.cost * end.cost;
    if (end.flagged && previousFlagged) d += scoring.flaggedDemerits;
  }
  if (Math.abs(fitnessClass(ratio) - previousFitness) > 1) d += scoring.fitnessDemerits;
  return d;
}

export function widthOf(lineWidth: number | ((line: number) => number), line: number): number {
  return typeof lineWidth === 'function' ? lineWidth(line) : lineWidth;
}

/** Scores an arbitrary list of breaks, so different algorithms can be compared on equal terms. */
export function score(
  p: Paragraph,
  breaks: number[],
  lineWidth: number | ((line: number) => number),
  scoring: Scoring = DEFAULT_SCORING,
  pass = 1,
): BreakResult {
  const ratios: number[] = [];
  const starts: number[] = [];
  let demerits = 0;
  let overfull = false;
  let start = 0;
  let flagged = false;
  let fitness = 1;

  breaks.forEach((end, line) => {
    const ratio = adjustmentRatio(measureLine(p, start, end), widthOf(lineWidth, line));
    const item = p.items[end];
    demerits += lineDemerits(scoring, ratio, item, flagged, fitness);
    if (ratio < -1 - 1e-9) overfull = true;
    ratios.push(ratio);
    starts.push(start);
    flagged = item.type === 'penalty' && item.flagged;
    fitness = fitnessClass(ratio);
    start = startAfter(p.items, end);
  });

  return { breaks, ratios, starts, demerits, overfull, pass };
}
