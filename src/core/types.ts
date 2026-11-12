/**
 * The box / glue / penalty model from Knuth & Plass, "Breaking Paragraphs
 * into Lines" (1981). A paragraph is a flat list of these three things.
 */

/** Something with a fixed width that cannot be broken: a word or a piece of one. */
export interface Box {
  type: 'box';
  width: number;
  text: string;
  /** How far this box may hang into the left margin when it starts a line. */
  lp?: number;
  /** How far this box may hang into the right margin when it ends a line. */
  rp?: number;
}

/** Elastic space. It can grow by `stretch` and shrink by `shrink` per unit of adjustment ratio. */
export interface Glue {
  type: 'glue';
  width: number;
  stretch: number;
  shrink: number;
}

/** A place where a line may end, at a price. `width` is only typeset if the break is taken. */
export interface Penalty {
  type: 'penalty';
  width: number;
  cost: number;
  /** Flagged breaks (hyphens) are discouraged from happening on consecutive lines. */
  flagged: boolean;
  text: string;
  rp?: number;
}

export type Item = Box | Glue | Penalty;

/** Returns the advance width of a string in whatever unit the caller likes. */
export type Measure = (text: string) => number;

/** A penalty this large forbids a break; its negative forces one. */
export const INFINITY = 10000;

export interface LineSpec {
  /** Width of a line, constant or per line (0-based). A function makes shaped paragraphs possible. */
  lineWidth: number | ((line: number) => number);
}

export interface BreakResult {
  /** Index of the item each line ends at. The last entry is always the final forced break. */
  breaks: number[];
  /** Adjustment ratio of each line: 0 is natural, 1 fully stretched, -1 fully shrunk. */
  ratios: number[];
  /** Index of the first item on each line. */
  starts: number[];
  /** Total demerits, scored the same way whichever algorithm produced the breaks. */
  demerits: number;
  /** True if at least one line could not be made to fit and sticks out. */
  overfull: boolean;
  /** Which attempt succeeded: 1 = within tolerance, 2 = emergency stretch, 3 = anything goes. */
  pass: number;
}
