/**
 * Vietnamese-aware normalizer (plan section 5.1).
 *
 * Produces three views of a string:
 *   `toned`  - NFC, lowercase, punctuation collapsed to spaces, canonical
 *              tone-mark placement. Kept for display and tie-breaking.
 *   `folded` - `toned` with every diacritic removed, `đ` mapped to `d`
 *              explicitly (NFD + strip combining marks leaves `đ` alone).
 *   `phon`   - `folded` syllables rewritten through a Vietnamese phonetic key
 *              so that initials and finals the ASR/dialect confuse collapse
 *              onto one form.
 *
 * Pure, dependency-free, and deterministic: the same input always yields the
 * same output, which is what lets the eval harness and the app share it.
 */

import { PHONETIC_RULES } from './phonetic_rules.vi.ts';

/** Latin vowels used in Vietnamese, including the modifier letters. */
const VOWELS = new Set(['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y']);

/** Vietnamese codas. A syllable ending in one of these places its tone on the last vowel. */
const FINAL_CONSONANTS = new Set(['c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't']);

/** Tone marks, in NFD combining form. */
const TONE_MARKS = new Set(['̀', '́', '̃', '̉', '̣']);

/** Modifier marks that belong to the vowel letter itself (breve, circumflex, horn). */
const MODIFIER_MARKS = new Set(['̆', '̂', '̛']);

/** Every combining mark we may meet; `folded` drops all of them. */
const COMBINING = /[̀-ͯ]/g;

/** Whether a character is a combining mark. Kept separate from `COMBINING` because a global regex carries `lastIndex` between calls. */
function isCombining(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x0300 && code <= 0x036f;
}

/** Non-letter, non-digit characters become spaces. */
const PUNCTUATION = /[^\p{L}\p{N}\s]/gu;

interface Syllable {
  /** Base letters, lowercase. */
  letters: string[];
  /** Modifier marks (breve/circumflex/horn) per letter index. */
  modifiers: string[][];
  /** The single tone mark carried by this syllable, or null. */
  tone: string | null;
  /** Index of the vowel the tone mark is currently attached to, or -1. */
  toneIndex: number;
}

function isVowel(char: string): boolean {
  return VOWELS.has(char);
}

/** Split one syllable into base letters, modifier marks, and the tone mark. */
function decompose(syllable: string): Syllable {
  const parts: Syllable = { letters: [], modifiers: [], tone: null, toneIndex: -1 };
  for (const char of syllable.normalize('NFD')) {
    if (TONE_MARKS.has(char)) {
      parts.tone = char;
      parts.toneIndex = parts.letters.length - 1;
      continue;
    }
    if (MODIFIER_MARKS.has(char)) {
      const at = parts.letters.length - 1;
      if (at >= 0) parts.modifiers[at].push(char);
      continue;
    }
    if (isCombining(char)) continue;
    parts.letters.push(char);
    parts.modifiers.push([]);
  }
  return parts;
}

/** Rebuild one syllable as NFC, placing the tone mark at `index`. */
function compose(parts: Syllable, index: number): string {
  let out = '';
  for (let i = 0; i < parts.letters.length; i += 1) {
    const marks = i === index && parts.tone ? `${parts.modifiers[i].join('')}${parts.tone}` : parts.modifiers[i].join('');
    out += (parts.letters[i] + marks).normalize('NFC');
  }
  return out;
}

/**
 * Where the nucleus starts. In `qu` and `gi` the second letter belongs to the
 * onset (`qu` is /kw/, `gi` is /z/), so it must not take the tone mark.
 */
function nucleusStart(letters: string[]): number {
  const head = letters.slice(0, 2).join('');
  if ((head === 'qu' || head === 'gi') && letters.length > 2) return 2;
  return 0;
}

/** The vowel positions of the nucleus, in order. */
function vowelIndices(letters: string[]): number[] {
  const indices: number[] = [];
  for (let i = nucleusStart(letters); i < letters.length; i += 1) if (isVowel(letters[i])) indices.push(i);
  return indices;
}

/** Whether the syllable ends in a coda consonant. */
function endsInConsonant(letters: string[]): boolean {
  for (let end = 1; end <= 2; end += 1) {
    const tail = letters.slice(letters.length - end).join('');
    if (FINAL_CONSONANTS.has(tail)) return true;
  }
  return false;
}

/**
 * Pick the vowel that carries the tone under one fixed convention, so that
 * inputs written in either of the two common styles ("hòa" / "hoà") converge.
 *
 * Closed syllable (has a coda): last vowel of the nucleus.
 * Open syllable: a three-vowel nucleus takes its middle vowel (`oái`,
 * `người`); anything shorter takes the first (`hòa`, `thúy`, `ái`).
 */
function toneTarget(parts: Syllable): number {
  const vowels = vowelIndices(parts.letters);
  if (vowels.length === 0) return -1;
  if (endsInConsonant(parts.letters)) return vowels[vowels.length - 1];
  if (vowels.length >= 3) return vowels[1];
  return vowels[0];
}

/** `toned`: canonical tone placement, lowercase, punctuation as spaces. */
export function toned(text: string): string {
  const syllables = text
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return syllables
    .map((syllable) => {
      const parts = decompose(syllable);
      if (!parts.tone) return compose(parts, -1);
      return compose(parts, toneTarget(parts));
    })
    .join(' ');
}

/**
 * `folded`: `toned` with all diacritics removed. `đ` has no NFD decomposition,
 * so it is mapped by hand; every other accented letter loses its marks.
 */
export function folded(text: string): string {
  return toned(text)
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/đ/g, 'd')
    .normalize('NFC');
}

const rules = PHONETIC_RULES;

/** Longest-first lookup so `ch` wins over `c` and `ng` over `n`. */
function groupLookup(groups: string[][]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const group of groups) {
    for (const member of group) lookup.set(member, group[0]);
  }
  return lookup;
}

const INITIAL_MAP = groupLookup(rules.initials);
const FINAL_MAP = groupLookup(rules.finals);
const INITIAL_LENGTHS = [...new Set([...INITIAL_MAP.keys()].map((k) => k.length))].sort((a, b) => b - a);
const FINAL_LENGTHS = [...new Set([...FINAL_MAP.keys()].map((k) => k.length))].sort((a, b) => b - a);

/** Rewrite one folded syllable through the phonetic key. */
function phoneticSyllable(syllable: string): string {
  let rest = syllable;
  let head = '';
  for (const length of INITIAL_LENGTHS) {
    const candidate = rest.slice(0, length);
    const mapped = INITIAL_MAP.get(candidate);
    // Never consume the whole syllable as an initial: a bare `d` or `v` is a word.
    if (mapped !== undefined && length < rest.length) {
      head = mapped;
      rest = rest.slice(length);
      break;
    }
  }
  let tail = '';
  for (const length of FINAL_LENGTHS) {
    const candidate = rest.slice(rest.length - length);
    const mapped = FINAL_MAP.get(candidate);
    if (mapped !== undefined && length < rest.length) {
      tail = mapped;
      rest = rest.slice(0, rest.length - length);
      break;
    }
  }
  return head + rest + tail;
}

/** `phon`: phonetic key of the folded view, syllable by syllable. */
export function phon(text: string): string {
  return folded(text)
    .split(' ')
    .filter(Boolean)
    .map(phoneticSyllable)
    .join(' ');
}
