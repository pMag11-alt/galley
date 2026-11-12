import type { Hyphenator } from './hyphenate.ts';
import { INFINITY, type Box, type Item, type Measure } from './types.ts';

export interface ItemOptions {
  /** Splits words into breakable pieces. Leave out to forbid hyphenation. */
  hyphenate?: Hyphenator | null;
  /** Cost of breaking at a hyphen. TeX uses 50. */
  hyphenPenalty?: number;
  /** Let punctuation hang into the margins so the text edge looks straight. */
  hang?: boolean;
  /** Width of the first-line indent. */
  indent?: number;
  /** Stretchability of a word space as a fraction of its width. */
  spaceStretch?: number;
  /** Shrinkability of a word space as a fraction of its width. */
  spaceShrink?: number;
}

/**
 * How much of a character's width may hang outside the measure. A full stop
 * is mostly white, so the eye reads a line ending in one as short; pushing it
 * most of the way into the margin makes the edge look optically straight.
 */
const HANG_RIGHT: Record<string, number> = {
  '.': 0.7, ',': 0.7, '-': 0.7, '‐': 0.7, ':': 0.5, ';': 0.5,
  '’': 0.7, '”': 0.5, "'": 0.7, '"': 0.5,
  '–': 0.3, '—': 0.2, '!': 0.2, '?': 0.2, ')': 0.05,
};
const HANG_LEFT: Record<string, number> = {
  '‘': 0.7, '“': 0.5, "'": 0.7, '"': 0.5, '(': 0.05,
};

/** Places inside a token where a line may end without adding a hyphen. */
const AFTER_DASH = /(?<=\p{L}[-‐])(?=\p{L})|(?<=[–—])(?=.)/u;
const LETTER_RUN = /\p{L}+/gu;

/** Turns a paragraph of plain text into boxes, glue and penalties. */
export function textToItems(text: string, measure: Measure, options: ItemOptions = {}): Item[] {
  const {
    hyphenate = null,
    hyphenPenalty = 50,
    hang = false,
    indent = 0,
    spaceStretch = 1 / 2,
    spaceShrink = 1 / 3,
  } = options;

  const items: Item[] = [];
  const space = measure(' ');
  const hyphen = measure('-');
  const cache = new Map<string, number>();
  const width = (s: string): number => {
    let w = cache.get(s);
    if (w === undefined) cache.set(s, (w = measure(s)));
    return w;
  };

  const box = (text: string, w: number): Box => {
    const b: Box = { type: 'box', width: w, text };
    if (hang && text) {
      const first = text[0];
      const last = text[text.length - 1];
      if (HANG_LEFT[first]) b.lp = HANG_LEFT[first] * width(first);
      if (HANG_RIGHT[last]) b.rp = HANG_RIGHT[last] * width(last);
    }
    return b;
  };

  if (indent > 0) items.push({ type: 'box', width: indent, text: '' });

  const words = text.trim().split(/\s+/).filter(Boolean);
  words.forEach((word, w) => {
    if (w > 0) {
      items.push({ type: 'glue', width: space, stretch: space * spaceStretch, shrink: space * spaceShrink });
    }

    const segments = word.split(AFTER_DASH);
    segments.forEach((segment, s) => {
      if (s > 0) {
        // The dash is already in the text, so breaking after it costs no extra width.
        const flagged = /[-‐]$/.test(segments[s - 1]);
        items.push({ type: 'penalty', width: 0, cost: hyphenPenalty, flagged, text: '' });
      }

      // Cut points inside this segment, found by hyphenating each run of letters.
      const cuts: number[] = [];
      if (hyphenate) {
        for (const run of segment.matchAll(LETTER_RUN)) {
          let at = run.index;
          const parts = hyphenate(run[0]);
          for (const part of parts.slice(0, -1)) cuts.push((at += part.length));
        }
      }

      // Measuring prefixes rather than fragments keeps kerning and ligatures
      // intact: the pieces of an unbroken word add up to exactly its width.
      let from = 0;
      for (const cut of [...cuts, segment.length]) {
        if (from > 0) {
          items.push({
            type: 'penalty',
            width: hyphen,
            cost: hyphenPenalty,
            flagged: true,
            text: '-',
            ...(hang ? { rp: HANG_RIGHT['-'] * hyphen } : {}),
          });
        }
        const w = width(segment.slice(0, cut)) - (from ? width(segment.slice(0, from)) : 0);
        items.push(box(segment.slice(from, cut), w));
        from = cut;
      }
    });
  });

  // The last line is allowed to fall short: infinitely stretchy glue fills it,
  // guarded by a penalty that stops a break from stranding the glue alone.
  items.push({ type: 'penalty', width: 0, cost: INFINITY, flagged: false, text: '' });
  items.push({ type: 'glue', width: 0, stretch: FILL, shrink: 0 });
  items.push({ type: 'penalty', width: 0, cost: -INFINITY, flagged: false, text: '' });
  return items;
}

/** Stretch of the glue that finishes a paragraph. Large enough to behave as infinite. */
export const FILL = 1e7;
