import { breakFirstFit } from './first-fit.ts';
import { textToItems, type ItemOptions } from './items.ts';
import { breakKnuthPlass, type KnuthPlassOptions } from './knuth-plass.ts';
import { layout, type LayoutOptions, type Line } from './layout.ts';
import type { BreakResult, Item, Measure } from './types.ts';

export * from './types.ts';
export { createHyphenator, type Hyphenator, type HyphenatorOptions } from './hyphenate.ts';
export { textToItems, FILL, type ItemOptions } from './items.ts';
export { breakKnuthPlass, type KnuthPlassOptions } from './knuth-plass.ts';
export { breakFirstFit, type FirstFitOptions } from './first-fit.ts';
export { layout, type Line, type Run, type Gap, type LayoutOptions } from './layout.ts';
export { findRivers, type River, type RiverLink, type RiverOptions } from './rivers.ts';
export { block, dropCap, circle, taper, type Shape } from './shapes.ts';
export { justifyMono, type MonoOptions } from './mono.ts';
export { badness, fitnessClass, score, prepare } from './paragraph.ts';

export interface TypesetOptions extends ItemOptions, KnuthPlassOptions, LayoutOptions {
  measure: Measure;
  /** 'total-fit' is Knuth–Plass; 'first-fit' is the greedy algorithm browsers use. */
  algorithm?: 'total-fit' | 'first-fit';
}

export interface Typeset {
  items: Item[];
  result: BreakResult;
  lines: Line[];
}

/** Text in, positioned lines out. The individual stages are exported for anything fancier. */
export function typeset(text: string, options: TypesetOptions): Typeset {
  const items = textToItems(text, options.measure, options);
  const result =
    options.algorithm === 'first-fit'
      ? breakFirstFit(items, { lineWidth: options.lineWidth, hyphens: !!options.hyphenate })
      : breakKnuthPlass(items, options);
  return { items, result, lines: layout(items, result, options) };
}
