import { FILL } from './items.ts';
import { widthOf } from './paragraph.ts';
import type { BreakResult, Item, LineSpec } from './types.ts';

/** A stretch of text with no breakable space in it, positioned on its line. */
export interface Run {
  text: string;
  x: number;
  width: number;
}

/** The space between two runs after justification. */
export interface Gap {
  x: number;
  width: number;
  /** Width the space would have had with no adjustment. */
  natural: number;
}

export interface Line {
  index: number;
  /** Left edge of the measure for this line. Hanging punctuation may sit outside it. */
  x: number;
  y: number;
  /** Target width of the line. */
  width: number;
  ratio: number;
  runs: Run[];
  gaps: Gap[];
  /** Ends in a hyphen that the breaker inserted. */
  hyphenated: boolean;
  last: boolean;
}

export interface LayoutOptions extends LineSpec {
  /** Horizontal offset of each line, for shapes that are not flush left. */
  lineOffset?: number | ((line: number) => number);
  lineHeight?: number;
  /** Number the lines from here; lets several paragraphs share one shape. */
  firstLine?: number;
  /** Set false for ragged-right text: spaces keep their natural width. */
  justify?: boolean;
}

/** Turns a list of breaks into positioned text, distributing each line's slack across its spaces. */
export function layout(items: Item[], result: BreakResult, options: LayoutOptions): Line[] {
  const lineHeight = options.lineHeight ?? 1;
  const firstLine = options.firstLine ?? 0;
  const justify = options.justify ?? true;

  return result.breaks.map((end, i) => {
    const start = result.starts[i];
    const ratio = result.ratios[i];
    const applied = justify && Number.isFinite(ratio) ? Math.max(ratio, -1) : 0;
    const offset = widthOf(options.lineOffset ?? 0, i);
    const runs: Run[] = [];
    const gaps: Gap[] = [];
    let run: Run | null = null;

    const first = items[start];
    let x = offset - (first?.type === 'box' ? (first.lp ?? 0) : 0);

    for (let k = start; k < end; k++) {
      const item = items[k];
      if (item.type === 'box') {
        if (item.text === '') {
          run = null;
        } else {
          if (!run) runs.push((run = { text: '', x, width: 0 }));
          run.text += item.text;
          run.width += item.width;
        }
        x += item.width;
      } else if (item.type === 'glue') {
        run = null;
        if (item.stretch >= FILL) continue;
        const width = item.width + applied * (applied >= 0 ? item.stretch : item.shrink);
        gaps.push({ x, width, natural: item.width });
        x += width;
      }
    }

    const breakItem = items[end];
    const hyphenated = breakItem.type === 'penalty' && breakItem.width > 0;
    if (hyphenated && run) {
      run.text += breakItem.text;
      run.width += breakItem.width;
    }

    return {
      index: firstLine + i,
      x: offset,
      y: (firstLine + i) * lineHeight,
      width: widthOf(options.lineWidth, i),
      ratio,
      runs,
      gaps,
      hyphenated,
      last: i === result.breaks.length - 1,
    };
  });
}
