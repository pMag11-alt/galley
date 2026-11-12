import {
  DEFAULT_SCORING,
  adjustmentRatio,
  fitnessClass,
  isForcedBreak,
  isLegalBreak,
  lineDemerits,
  measureLine,
  prepare,
  score,
  startAfter,
  widthOf,
  type Paragraph,
  type Scoring,
} from './paragraph.ts';
import type { BreakResult, Item, LineSpec } from './types.ts';

export interface KnuthPlassOptions extends LineSpec, Partial<Scoring> {
  /** Worst badness a line may have before it is rejected. TeX's default is 200. */
  tolerance?: number;
  /**
   * Extra stretch every line is assumed to have on the second attempt, when
   * nothing fits within tolerance. Defaults to 5% of the first line.
   */
  emergencyStretch?: number;
  /** Ask for a paragraph this many lines longer (+) or shorter (-) than optimal, if possible. */
  looseness?: number;
}

/** A way of reaching a breakpoint: the best one found for its line number and fitness class. */
interface Node {
  position: number;
  /** First item of the line that follows this break. */
  start: number;
  line: number;
  fitness: number;
  flagged: boolean;
  demerits: number;
  previous: Node | null;
}

/**
 * Knuth & Plass's total-fit line breaking.
 *
 * Instead of filling each line and moving on, it treats the paragraph as a
 * shortest-path problem: every legal breakpoint is a vertex, every feasible
 * line an edge weighted by its demerits, and the answer is the cheapest path
 * from the first word to the last. Dynamic programming over a short list of
 * "active" breakpoints keeps it close to linear time.
 */
export function breakKnuthPlass(items: Item[], options: KnuthPlassOptions): BreakResult {
  const paragraph = prepare(items);
  const scoring: Scoring = {
    linePenalty: options.linePenalty ?? DEFAULT_SCORING.linePenalty,
    flaggedDemerits: options.flaggedDemerits ?? DEFAULT_SCORING.flaggedDemerits,
    fitnessDemerits: options.fitnessDemerits ?? DEFAULT_SCORING.fitnessDemerits,
  };
  const tolerance = options.tolerance ?? 200;
  const emergency = options.emergencyStretch ?? widthOf(options.lineWidth, 0) * 0.05;

  // Like TeX, try politely first and get progressively less fussy.
  const attempts = [
    { maxRatio: Math.cbrt(tolerance / 100), extra: 0, force: false },
    { maxRatio: Math.cbrt(tolerance / 100), extra: emergency, force: false },
    { maxRatio: Infinity, extra: emergency, force: true },
  ];

  for (let i = 0; i < attempts.length; i++) {
    if (i === 1 && emergency <= 0) continue;
    const { maxRatio, extra, force } = attempts[i];
    const breaks = run(paragraph, options, scoring, maxRatio, extra, force);
    if (breaks) return score(paragraph, breaks, options.lineWidth, scoring, i + 1);
  }
  throw new Error('galley: paragraph has no final forced break');
}

function run(
  p: Paragraph,
  options: KnuthPlassOptions,
  scoring: Scoring,
  maxRatio: number,
  extraStretch: number,
  force: boolean,
): number[] | null {
  const { items } = p;
  const looseness = options.looseness ?? 0;
  // With equal lines, two routes to the same breakpoint are interchangeable
  // whatever their length. Once line widths vary (or the line count matters)
  // the line number becomes part of a node's identity.
  const byLine = typeof options.lineWidth === 'function' || looseness !== 0;

  let active: Node[] = [
    { position: -1, start: 0, line: 0, fitness: 1, flagged: false, demerits: 0, previous: null },
  ];
  const finished: Node[] = [];

  for (let b = 0; b < items.length; b++) {
    if (!isLegalBreak(items, b)) continue;
    const item = items[b];
    const forced = isForcedBreak(item);
    const best = new Map<number, { from: Node; demerits: number; fitness: number }>();
    const survivors: Node[] = [];
    let fallback: Node | null = null;

    for (const a of active) {
      const metrics = measureLine(p, a.start, b);
      const ratio = adjustmentRatio(metrics, widthOf(options.lineWidth, a.line), extraStretch);

      // Once a line is too long from `a` it only gets longer, so `a` is done.
      if (ratio < -1 || forced) {
        if (!fallback || a.demerits < fallback.demerits) fallback = a;
      } else {
        survivors.push(a);
      }
      if (ratio < -1 || ratio > maxRatio) continue;

      const fitness = fitnessClass(ratio);
      const demerits = a.demerits + lineDemerits(scoring, ratio, item, a.flagged, a.fitness);
      const key = byLine ? (a.line + 1) * 4 + fitness : fitness;
      const current = best.get(key);
      if (!current || demerits < current.demerits) best.set(key, { from: a, demerits, fitness });
    }

    active = survivors;
    const created: Node[] = [];
    for (const { from, demerits, fitness } of best.values()) {
      created.push(makeNode(items, b, from, demerits, fitness));
    }

    // Nothing fits and nothing is left to try: a word is wider than the line.
    // As a last resort, accept the overfull line and carry on from here.
    if (force && created.length === 0 && active.length === 0 && fallback) {
      created.push(makeNode(items, b, fallback, fallback.demerits + 1e8, 0));
    }

    if (forced && b === items.length - 1) finished.push(...created);
    else active.push(...created);
    if (active.length === 0 && finished.length === 0) return null;
  }

  if (finished.length === 0) return null;
  let chosen = finished.reduce((x, y) => (y.demerits < x.demerits ? y : x));

  if (looseness !== 0) {
    const optimal = chosen;
    let moved = 0;
    for (const node of finished) {
      const delta = node.line - optimal.line;
      // Only move in the requested direction, and never past the request.
      if (delta === 0 || Math.sign(delta) !== Math.sign(looseness)) continue;
      if (Math.abs(delta) > Math.abs(looseness)) continue;
      const further = Math.abs(delta) > moved;
      if (further || (Math.abs(delta) === moved && node.demerits < chosen.demerits)) {
        chosen = node;
        moved = Math.abs(delta);
      }
    }
  }

  const breaks: number[] = [];
  for (let node: Node | null = chosen; node && node.previous; node = node.previous) {
    breaks.push(node.position);
  }
  return breaks.reverse();
}

function makeNode(items: Item[], at: number, from: Node, demerits: number, fitness: number): Node {
  const item = items[at];
  return {
    position: at,
    start: startAfter(items, at),
    line: from.line + 1,
    fitness,
    flagged: item.type === 'penalty' && item.flagged,
    demerits,
    previous: from,
  };
}
