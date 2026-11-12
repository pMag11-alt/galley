import type { Line } from './layout.ts';

export interface RiverLink {
  line: number;
  x: number;
  width: number;
}

/** A run of word spaces that line up vertically across consecutive lines. */
export interface River {
  links: RiverLink[];
}

export interface RiverOptions {
  /** Fewest consecutive lines before aligned gaps count as a river. */
  minLines?: number;
  /** Only gaps at least this many times their natural width take part. */
  minStretch?: number;
}

/**
 * Finds rivers: the white streaks that run down a badly justified paragraph
 * where over-wide word spaces happen to stack up. The eye follows them
 * instead of the text.
 */
export function findRivers(lines: Line[], options: RiverOptions = {}): River[] {
  const minLines = options.minLines ?? 3;
  const minStretch = options.minStretch ?? 1.15;
  const rivers: River[] = [];
  let open: River[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const contiguous = i > 0 && lines[i - 1].index === line.index - 1;
    const wide = line.gaps.filter((g) => g.width >= g.natural * minStretch);
    const next: River[] = [];
    const taken = new Set<River>();

    for (const gap of wide) {
      let parent: River | null = null;
      let most = 0;
      if (contiguous) {
        for (const river of open) {
          if (taken.has(river)) continue;
          const above = river.links[river.links.length - 1];
          const overlap = Math.min(above.x + above.width, gap.x + gap.width) - Math.max(above.x, gap.x);
          // Gaps must share most of the narrower one to read as a continuous channel.
          if (overlap > most && overlap >= 0.5 * Math.min(above.width, gap.width)) {
            most = overlap;
            parent = river;
          }
        }
      }
      const link = { line: line.index, x: gap.x, width: gap.width };
      if (parent) {
        taken.add(parent);
        parent.links.push(link);
        next.push(parent);
      } else {
        next.push({ links: [link] });
      }
    }

    for (const river of open) {
      if (!taken.has(river) && river.links.length >= minLines) rivers.push(river);
    }
    open = next;
  }

  for (const river of open) if (river.links.length >= minLines) rivers.push(river);
  return rivers;
}
