/** The outline a paragraph is poured into: a width and a left offset for every line. */
export interface Shape {
  width: (line: number) => number;
  offset: (line: number) => number;
}

/** An ordinary column. */
export function block(width: number): Shape {
  return { width: () => width, offset: () => 0 };
}

/** A column whose first few lines step aside for a large initial. */
export function dropCap(width: number, lines: number, inset: number): Shape {
  return {
    width: (line) => (line < lines ? width - inset : width),
    offset: (line) => (line < lines ? inset : 0),
  };
}

/** A disc. Each line is the chord at the height of its vertical centre. */
export function circle(radius: number, lineHeight: number, minWidth = lineHeight * 2): Shape {
  const chord = (line: number) => {
    const d = radius - (line + 0.5) * lineHeight;
    const half = Math.abs(d) < radius ? Math.sqrt(radius * radius - d * d) : 0;
    return Math.max(2 * half, minWidth);
  };
  return {
    width: chord,
    offset: (line) => radius - chord(line) / 2,
  };
}

/** A column that narrows evenly from `top` to `bottom` over `lines` lines, centred. */
export function taper(top: number, bottom: number, lines: number): Shape {
  const width = (line: number) => {
    const t = Math.min(line / Math.max(lines - 1, 1), 1);
    return top + (bottom - top) * t;
  };
  return { width, offset: (line) => (Math.max(top, bottom) - width(line)) / 2 };
}
