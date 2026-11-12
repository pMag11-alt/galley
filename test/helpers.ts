import type { Measure } from '../src/core/types.ts';

/** Every character one unit wide: easy to reason about by hand. */
export const mono: Measure = (s) => [...s].length;

/** A crude proportional font so tests exercise non-integer widths. */
export const proportional: Measure = (s) => {
  let w = 0;
  for (const ch of s) w += 'il.,;:\'!|'.includes(ch) ? 2.8 : 'mwMW'.includes(ch) ? 8.3 : ch === ' ' ? 3.3 : 5.1;
  return w;
};

/** Small deterministic generator, so "random" paragraphs are the same on every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomText(seed: number, words: number): string {
  const next = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    const length = 1 + Math.floor(next() * 9);
    let word = '';
    for (let k = 0; k < length; k++) word += String.fromCharCode(97 + Math.floor(next() * 26));
    out.push(word);
  }
  return out.join(' ');
}

export const FROG_KING =
  'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful; ' +
  'and the youngest was so beautiful that the sun itself, which has seen so much, was astonished whenever ' +
  'it shone in her face. Close by the king’s castle lay a great dark forest, and under an old lime-tree ' +
  'in the forest was a well, and when the day was very warm, the king’s child went out into the forest ' +
  'and sat down by the side of the cool fountain; and when she was bored she took a golden ball, and threw ' +
  'it up on high and caught it; and this ball was her favorite plaything.';
