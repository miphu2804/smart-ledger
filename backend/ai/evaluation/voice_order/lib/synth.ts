/**
 * Deterministic Vietnamese ASR confusion simulator (plan section 7.1, dataset
 * D2).
 *
 * Given a clean span (a product name), `synthesize` rewrites it the way a
 * Vietnamese streaming ASR might mis-hear it: dropped or swapped tones, merged
 * onsets/codas, split or merged syllables, Vietnamised loanwords, and random
 * character edits. The rules and their weights live in `synth_rules.vi.ts`;
 * this module only applies them.
 *
 * Determinism is the contract: every choice comes from a seeded PRNG, never
 * `Math.random`, so a rerun with the same seed reproduces the dataset byte for
 * byte. Each call reports which rules fired so the harness can break results
 * down by error type.
 *
 * `fitWeights` is the hook the plan's "fit rule frequencies to the D1 error
 * distribution" step will use once real (heard, reference) pairs exist. No such
 * pairs exist in this repository, so `DEFAULT_SYNTH_WEIGHTS` stays unfitted.
 */

import {
  CHAR_EDIT_P,
  CONFUSION_DATA,
  DEFAULT_SYNTH_WEIGHTS,
  SYNTH_RULE_NAMES,
} from './synth_rules.vi.ts';
import type { SynthRuleName, SynthRuleWeights } from './synth_rules.vi.ts';

export type { SynthRuleName, SynthRuleWeights };

/** One simulator result: the noisy span plus the rules that fired. */
export interface SynthResult {
  text: string;
  /** Rules that actually changed the text, in `SYNTH_RULE_NAMES` order. */
  rules: SynthRuleName[];
}

export interface SynthOptions {
  seed: number;
  /** Rule firing probabilities. Defaults to `DEFAULT_SYNTH_WEIGHTS`. */
  weights?: SynthRuleWeights;
  /** Per-character edit probability. Defaults to `CHAR_EDIT_P` (0.05). */
  charEditP?: number;
}

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Tone machinery ──────────────────────────────────────────────────────────
//
// The resolver's `normalizer.ts` owns the same decomposition but keeps it
// private; the simulator must not reach into a frozen module's internals, so it
// carries its own minimal copy.

const TONE_MARKS = new Set(CONFUSION_DATA.toneMarks);
const MODIFIER_MARKS = new Set(CONFUSION_DATA.modifierMarks);
const VOWELS = new Set(CONFUSION_DATA.vowelLetters);
const FINAL_CONSONANTS = new Set(CONFUSION_DATA.finalConsonants);

interface Syllable {
  letters: string[];
  modifiers: string[][];
  tone: string | null;
}

function decompose(syllable: string): Syllable {
  const parts: Syllable = { letters: [], modifiers: [], tone: null };
  for (const ch of syllable.normalize('NFD')) {
    if (TONE_MARKS.has(ch)) {
      parts.tone = ch;
      continue;
    }
    if (MODIFIER_MARKS.has(ch)) {
      const at = parts.letters.length - 1;
      if (at >= 0) parts.modifiers[at].push(ch);
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // stray combining mark
    parts.letters.push(ch);
    parts.modifiers.push([]);
  }
  return parts;
}

function compose(parts: Syllable, toneIndex: number): string {
  let out = '';
  for (let i = 0; i < parts.letters.length; i += 1) {
    const marks =
      i === toneIndex && parts.tone ? `${parts.modifiers[i].join('')}${parts.tone}` : parts.modifiers[i].join('');
    out += (parts.letters[i] + marks).normalize('NFC');
  }
  return out;
}

function nucleusStart(letters: string[]): number {
  const head = letters.slice(0, 2).join('');
  if ((head === 'qu' || head === 'gi') && letters.length > 2) return 2;
  return 0;
}

function vowelIndices(letters: string[]): number[] {
  const out: number[] = [];
  for (let i = nucleusStart(letters); i < letters.length; i += 1) if (VOWELS.has(letters[i])) out.push(i);
  return out;
}

function endsInConsonant(letters: string[]): boolean {
  for (let end = 1; end <= 2; end += 1) {
    if (FINAL_CONSONANTS.has(letters.slice(letters.length - end).join(''))) return true;
  }
  return false;
}

/** The vowel a tone mark belongs on (same convention as the normalizer). */
function toneTarget(parts: Syllable): number {
  const vowels = vowelIndices(parts.letters);
  if (vowels.length === 0) return -1;
  if (endsInConsonant(parts.letters)) return vowels[vowels.length - 1];
  if (vowels.length >= 3) return vowels[1];
  return vowels[0];
}

/** Drop the tone mark, keeping the vowel's own modifier (ă/â/ê/ô/ơ/ư). */
function toneLoss(word: string): string {
  const parts = decompose(word);
  if (!parts.tone) return word;
  parts.tone = null;
  return compose(parts, -1);
}

/** Swap the tone for a different one (or add one when the syllable is `ngang`). */
function toneSwap(word: string, rng: () => number): string {
  const parts = decompose(word);
  const others = CONFUSION_DATA.toneMarks.filter((t) => t !== parts.tone);
  if (others.length === 0) return word;
  const pick = others[Math.floor(rng() * others.length)] ?? others[0];
  parts.tone = pick;
  const target = toneTarget(parts);
  if (target < 0) return word;
  return compose(parts, target);
}

// ─── Onset / coda merges ─────────────────────────────────────────────────────

const ONSETS = [...CONFUSION_DATA.onsets].sort((a, b) => b.length - a.length);
const CODAS = [...CONFUSION_DATA.codas].sort((a, b) => b.length - a.length);

function groupOf(member: string, groups: string[][]): string[] | undefined {
  return groups.find((g) => g.includes(member));
}

/** Replace a confused onset with a sibling from its group. */
function initialMerge(word: string, rng: () => number): string {
  const lower = word.toLowerCase();
  for (const onset of ONSETS) {
    if (!lower.startsWith(onset) || word.length <= onset.length) continue;
    const group = groupOf(onset, CONFUSION_DATA.initialGroups);
    if (!group) return word; // a valid onset that is not confused
    const others = group.filter((m) => m !== onset);
    if (others.length === 0) return word;
    const pick = others[Math.floor(rng() * others.length)] ?? others[0];
    return pick + word.slice(onset.length);
  }
  return word;
}

/** Replace a confused coda with a sibling from its group. */
function finalMerge(word: string, rng: () => number): string {
  const lower = word.toLowerCase();
  for (const coda of CODAS) {
    if (word.length <= coda.length || !lower.endsWith(coda)) continue;
    const group = groupOf(coda, CONFUSION_DATA.finalGroups);
    if (!group) return word;
    const others = group.filter((m) => m !== coda);
    if (others.length === 0) return word;
    const pick = others[Math.floor(rng() * others.length)] ?? others[0];
    return word.slice(0, word.length - coda.length) + pick;
  }
  return word;
}

// ─── Syllable split / merge ──────────────────────────────────────────────────

function canonicalOnset(onset: string): string {
  const group = groupOf(onset, CONFUSION_DATA.initialGroups);
  return group ? group[0] : onset;
}

/** "sting" -> "xi ting": split a foreign onset into an open syllable + the rest. */
function syllableSplit(word: string): string {
  const lower = word.toLowerCase();
  for (const cluster of CONFUSION_DATA.foreignOnsets) {
    if (!lower.startsWith(cluster)) continue;
    const rest = word.slice(1);
    if (!rest) return word;
    return `${canonicalOnset(word[0].toLowerCase())}i ${rest}`;
  }
  return word;
}

function canSplit(word: string): boolean {
  if (word.includes(' ') || word.length < 3) return false;
  const lower = word.toLowerCase();
  return CONFUSION_DATA.foreignOnsets.some((c) => lower.startsWith(c));
}

// ─── Random character edit ───────────────────────────────────────────────────

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const DIGITS = '0123456789'.split('');

const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => /[a-zA-ZÀ-ỹ]/.test(c);

/** Substitute/insert/delete one character, never emptying the token. */
function charEdit(word: string, p: number, rng: () => number): string {
  const chars = [...word];
  const out: string[] = [];
  let changed = false;
  for (const c of chars) {
    if (rng() >= p) {
      out.push(c);
      continue;
    }
    const roll = rng();
    const replacement = isDigit(c) ? DIGITS[Math.floor(rng() * DIGITS.length)] : LETTERS[Math.floor(rng() * LETTERS.length)];
    if (roll < 0.6) {
      out.push(replacement); // substitute
      changed = true;
    } else if (roll < 0.8) {
      out.push(c, replacement); // insert after
      changed = true;
    } else if (out.length + 1 < chars.length || out.length > 0) {
      // delete (guarded: never leave the token empty)
      changed = true;
    } else {
      out.push(replacement);
      changed = true;
    }
  }
  const result = out.join('');
  return changed && result.length > 0 ? result : word;
}

const SIZE_UNIT = new Set(CONFUSION_DATA.sizeUnitTokens);

/** Whether a token reads as a package size or unit ("330ml", "1kg", "chai", "lốc"). */
function isSizeOrUnit(token: string): boolean {
  const folded = fold(token).replace(/[^a-z0-9.]/g, '');
  if (folded === '') return false;
  if (/^\d+(\.\d+)?(ml|l|g|kg|gr|gam|lit|ki|ky)$/.test(folded)) return true;
  if (/^\d+$/.test(folded)) return true;
  return SIZE_UNIT.has(folded);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Rewrite one clean span as a plausible ASR mishearing.
 *
 * Every rule fires with its own probability, independently per token (and, for
 * the character edit, per character). The result is never empty: if the rules
 * would empty a token the input is returned unchanged.
 */
export function synthesize(text: string, options: SynthOptions): SynthResult {
  const rng = mulberry32(options.seed);
  const weights = options.weights ?? DEFAULT_SYNTH_WEIGHTS;
  const p = options.charEditP ?? CHAR_EDIT_P;
  const fired = new Set<SynthRuleName>();

  let tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { text, rules: [] };

  // `truncate`: real speakers drop the package size/unit ("Sting dâu", not
  // "Sting dâu chai 330ml"), so the spoken span is a prefix of the catalog name.
  // Drop trailing size/unit tokens, never the whole span.
  if (rng() < weights.truncate) {
    let end = tokens.length;
    while (end > 1 && isSizeOrUnit(tokens[end - 1])) end -= 1;
    if (end < tokens.length) {
      tokens = tokens.slice(0, end);
      fired.add('truncate');
    }
  }

  const out: string[] = [];
  for (const token of tokens) {
    let tok = token;
    const folded = fold(tok);
    if (CONFUSION_DATA.loanwords[folded] !== undefined && rng() < weights.loanword) {
      tok = CONFUSION_DATA.loanwords[folded];
      fired.add('loanword');
    } else if (canSplit(tok) && rng() < weights.syllable_split) {
      const split = syllableSplit(tok);
      if (split !== tok) {
        tok = split;
        fired.add('syllable_split');
      }
    }

    const syllables = tok
      .split(/\s+/)
      .filter(Boolean)
      .map((syllable) => {
        let w = syllable;
        if (rng() < weights.initial_merge) {
          const next = initialMerge(w, rng);
          if (next !== w) {
            w = next;
            fired.add('initial_merge');
          }
        }
        if (rng() < weights.final_merge) {
          const next = finalMerge(w, rng);
          if (next !== w) {
            w = next;
            fired.add('final_merge');
          }
        }
        if (rng() < weights.tone_loss) {
          const next = toneLoss(w);
          if (next !== w) {
            w = next;
            fired.add('tone_loss');
          }
        } else if (rng() < weights.tone_swap) {
          const next = toneSwap(w, rng);
          if (next !== w) {
            w = next;
            fired.add('tone_swap');
          }
        }
        const edited = charEdit(w, p, rng);
        if (edited !== w) {
          w = edited;
          fired.add('char_edit');
        }
        return w;
      });

    out.push(syllables.join(' '));
  }

  let parts = out;
  if (parts.length >= 2 && rng() < weights.syllable_merge) {
    const idx = Math.floor(rng() * (parts.length - 1));
    const merged = `${parts[idx]}${parts[idx + 1]}`;
    if (merged.trim() !== '') {
      parts = [...parts.slice(0, idx), merged, ...parts.slice(idx + 2)];
      fired.add('syllable_merge');
    }
  }

  const result = parts.join(' ').trim();
  if (result === '') return { text, rules: [] };
  return { text: result, rules: SYNTH_RULE_NAMES.filter((r) => fired.has(r)) };
}

/**
 * Project the fired rules onto the harness's closed tag vocabulary
 * (`CONTRACT.md`): `clean` when nothing fired, `loanword` when the Vietnamisation
 * rule fired, `dialect` for an onset/coda merge. Rules with no closed-vocabulary
 * equivalent contribute no tag; the full fired-rule list travels in the record's
 * `rules` field instead.
 */
export function rulesToTags(rules: SynthRuleName[]): string[] {
  if (rules.length === 0) return ['clean'];
  const tags: string[] = [];
  if (rules.includes('loanword')) tags.push('loanword');
  if (rules.includes('initial_merge') || rules.includes('final_merge')) tags.push('dialect');
  // `truncate`, like the tone/split/char rules, has no closed-vocabulary tag;
  // it is reported in the record's `rules` field only.
  return tags;
}

// ─── Weight fitting (placeholder for a later phase) ──────────────────────────

/** Lowercase, diacritics removed, `đ` -> `d`. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** Diacritics removed but tone marks preserved is not needed; strip tone only. */
function stripTones(s: string): string {
  return s.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
}

/** Crude detector of which rules explain a (reference, heard) difference. */
function classifyPair(reference: string, heard: string): SynthRuleName[] {
  if (reference === heard) return [];
  const rules = new Set<SynthRuleName>();
  if (stripTones(reference) === stripTones(heard)) {
    const refTones = (reference.match(/[̣̀́̃̉]/g) ?? []).length;
    const heardTones = (heard.match(/[̣̀́̃̉]/g) ?? []).length;
    rules.add(heardTones < refTones ? 'tone_loss' : 'tone_swap');
    return [...rules];
  }
  const fr = fold(reference);
  const fh = fold(heard);
  if (fr.replace(/\s+/g, '') === fh.replace(/\s+/g, '')) {
    rules.add(fr.split(' ').length === fh.split(' ').length ? 'char_edit' : 'syllable_split');
    return [...rules];
  }
  rules.add('char_edit');
  return [...rules];
}

/**
 * Fit rule weights from observed (heard, reference) pairs.
 *
 * Each weight is the share of pairs in which the rule is detectable, clamped to
 * `[0, 1]`. This is a deliberately crude frequency fit — the plan calls for
 * fitting to the D1 error distribution, which needs real ASR pairs. With none
 * available now the simulator uses `DEFAULT_SYNTH_WEIGHTS` instead.
 */
export function fitWeights(pairs: Array<{ heard: string; reference: string }>): SynthRuleWeights {
  const counts: Record<SynthRuleName, number> = {
    tone_loss: 0,
    tone_swap: 0,
    initial_merge: 0,
    final_merge: 0,
    syllable_split: 0,
    syllable_merge: 0,
    loanword: 0,
    truncate: 0,
    char_edit: 0,
  };
  for (const pair of pairs) {
    for (const rule of classifyPair(pair.reference, pair.heard)) counts[rule] += 1;
  }
  const n = Math.max(1, pairs.length);
  const weights = {} as SynthRuleWeights;
  for (const rule of SYNTH_RULE_NAMES) weights[rule] = Math.min(1, Math.max(0, counts[rule] / n));
  return weights;
}
