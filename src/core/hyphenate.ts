/**
 * Liang's hyphenation algorithm (Frank Liang, "Word Hy-phen-a-tion by
 * Com-put-er", 1983), the one TeX uses.
 *
 * Every pattern is a short string of letters with digits between them, like
 * `hy3ph` or `1tio`. All patterns matching anywhere in a word vote on each
 * gap between letters; the highest digit wins and an odd winner permits a
 * break. Patterns are stored in a trie so one pass per starting letter finds
 * every match.
 */

interface TrieNode {
  next: Map<string, TrieNode>;
  points?: Uint8Array;
}

export interface HyphenatorOptions {
  /** Space-separated words with their breaks spelled out, e.g. "ta-ble pro-ject". */
  exceptions?: string;
  /** Fewest letters allowed before the first break. */
  leftMin?: number;
  /** Fewest letters allowed after the last break. */
  rightMin?: number;
}

/** Splits a word into the pieces it may be broken between. */
export type Hyphenator = (word: string) => string[];

const LETTERS_ONLY = /^\p{L}+$/u;

export function createHyphenator(patterns: string, options: HyphenatorOptions = {}): Hyphenator {
  const leftMin = options.leftMin ?? 2;
  const rightMin = options.rightMin ?? 3;
  const root: TrieNode = { next: new Map() };

  for (const pattern of patterns.split(/\s+/)) {
    if (!pattern) continue;
    const points: number[] = [0];
    let node = root;
    for (const ch of pattern) {
      if (ch >= '0' && ch <= '9') {
        points[points.length - 1] = ch.charCodeAt(0) - 48;
        continue;
      }
      const key = ch === '_' ? '.' : ch;
      let child = node.next.get(key);
      if (!child) node.next.set(key, (child = { next: new Map() }));
      node = child;
      points.push(0);
    }
    node.points = Uint8Array.from(points);
  }

  const exceptions = new Map<string, number[]>();
  for (const entry of (options.exceptions ?? '').split(/\s+/)) {
    if (!entry) continue;
    const cuts: number[] = [];
    let offset = 0;
    for (const part of entry.split('-').slice(0, -1)) cuts.push((offset += part.length));
    exceptions.set(entry.replaceAll('-', ''), cuts);
  }

  const cache = new Map<string, number[]>();

  function breakpoints(lower: string): number[] {
    const known = exceptions.get(lower) ?? cache.get(lower);
    if (known) return known;

    const word = `.${lower}.`;
    const scores = new Uint8Array(word.length + 1);
    for (let i = 0; i < word.length; i++) {
      let node: TrieNode | undefined = root;
      for (let j = i; j < word.length; j++) {
        node = node.next.get(word[j]);
        if (!node) break;
        const p = node.points;
        if (p) for (let k = 0; k < p.length; k++) if (p[k] > scores[i + k]) scores[i + k] = p[k];
      }
    }

    const cuts: number[] = [];
    // scores[p] sits before word[p]; word is offset by one because of the leading dot.
    for (let at = leftMin; at <= lower.length - rightMin; at++) {
      if (scores[at + 1] & 1) cuts.push(at);
    }
    cache.set(lower, cuts);
    return cuts;
  }

  return (word) => {
    if (word.length < leftMin + rightMin || !LETTERS_ONLY.test(word)) return [word];
    const lower = word.toLowerCase();
    if (lower.length !== word.length) return [word];
    const parts: string[] = [];
    let from = 0;
    for (const cut of breakpoints(lower)) {
      parts.push(word.slice(from, cut));
      from = cut;
    }
    parts.push(word.slice(from));
    return parts;
  };
}
