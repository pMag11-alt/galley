import { createHyphenator } from './hyphenate.ts';
import { exceptions, leftMin, patterns, rightMin } from './patterns/en-us.ts';

/** A ready-made hyphenator for American English. */
export const hyphenateEnglish = createHyphenator(patterns, { exceptions, leftMin, rightMin });
