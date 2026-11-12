#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { hyphenateEnglish } from '../src/core/english.ts';
import { justifyMono } from '../src/core/mono.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (flag('--help') || flag('-h')) {
  console.log(`galley: justify plain text with Knuth-Plass line breaking

usage: galley [file] [--width 66] [--first-fit] [--no-hyphens]

Reads the file, or standard input when none is given.`);
  process.exit(0);
}

const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--width');
const text = readFileSync(positional[0] ?? 0, 'utf8');
const width = Number(value('--width', '66'));
if (!Number.isInteger(width) || width < 10) {
  console.error('galley: --width must be a whole number of at least 10');
  process.exit(1);
}

const lines = justifyMono(text, width, {
  firstFit: flag('--first-fit'),
  hyphenate: flag('--no-hyphens') ? null : hyphenateEnglish,
});
console.log(lines.join('\n'));
