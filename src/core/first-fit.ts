import {
  isForcedBreak,
  isLegalBreak,
  measureLine,
  prepare,
  score,
  startAfter,
  widthOf,
} from './paragraph.ts';
import type { BreakResult, Item, LineSpec } from './types.ts';

export interface FirstFitOptions extends LineSpec {
  /** Allow lines to end at discretionary hyphens. Browsers do not by default. */
  hyphens?: boolean;
}

/**
 * The greedy algorithm every browser and word processor uses: put words on
 * the line until the next one will not fit, then start a new line and never
 * look back. Fast and simple, and the reason justified text on the web has
 * such a poor reputation.
 */
export function breakFirstFit(items: Item[], options: FirstFitOptions): BreakResult {
  const p = prepare(items);
  const breaks: number[] = [];
  let start = 0;
  let candidate = -1;

  const take = (at: number) => {
    breaks.push(at);
    start = startAfter(items, at);
    candidate = -1;
  };

  for (let b = 0; b < items.length; b++) {
    if (!isLegalBreak(items, b)) continue;
    const item = items[b];
    if (item.type === 'penalty' && item.width > 0 && !options.hyphens) continue;

    const target = widthOf(options.lineWidth, breaks.length);
    if (measureLine(p, start, b).width > target + 1e-6 && candidate >= 0) {
      // The line was full one breakpoint ago. Break there and look at `b` again.
      take(candidate);
      b = start - 1;
      continue;
    }
    if (isForcedBreak(item)) take(b);
    else candidate = b;
  }

  return score(p, breaks, options.lineWidth);
}
