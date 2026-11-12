import { breakFirstFit } from './first-fit.ts';
import type { Hyphenator } from './hyphenate.ts';
import { textToItems } from './items.ts';
import { breakKnuthPlass } from './knuth-plass.ts';
import { layout } from './layout.ts';

export interface MonoOptions {
  hyphenate?: Hyphenator | null;
  /** Use the greedy algorithm instead, to see the difference. */
  firstFit?: boolean;
  tolerance?: number;
}

/**
 * Justifies plain text for a fixed-width display, such as a terminal or a
 * code comment. Every character is one cell wide, so a space can only grow
 * by whole cells: the breaker works with real numbers and the positions are
 * rounded afterwards, which spreads the extra cells evenly along the line.
 */
export function justifyMono(text: string, width: number, options: MonoOptions = {}): string[] {
  const out: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  paragraphs.forEach((paragraph, n) => {
    if (n > 0) out.push('');
    const items = textToItems(paragraph, (s) => [...s].length, {
      hyphenate: options.hyphenate ?? null,
      spaceStretch: 1,
      spaceShrink: 0,
    });
    const result = options.firstFit
      ? breakFirstFit(items, { lineWidth: width, hyphens: !!options.hyphenate })
      : breakKnuthPlass(items, { lineWidth: width, tolerance: options.tolerance ?? 400 });

    for (const line of layout(items, result, { lineWidth: width })) {
      let row = '';
      for (const run of line.runs) {
        row = row.padEnd(Math.round(run.x)) + run.text;
      }
      out.push(row);
    }
  });

  return out;
}
