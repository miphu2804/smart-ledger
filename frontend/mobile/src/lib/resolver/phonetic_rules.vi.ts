/**
 * Vietnamese phonetic key (plan section 5.1, `phon` view).
 *
 * Pure data: each group lists spellings that ASR and dialect variation
 * routinely confuse, most-common-first. The first member is the canonical
 * form, so every member of a group collapses onto it. No logic lives here.
 *
 * Stored as a `.ts` module rather than `.json` so that both Metro and Node's
 * type stripping can load it with no bundler plugin and no loader hook.
 */

export interface PhoneticRuleSet {
  /** Groups of syllable onsets that collapse onto the group's first member. */
  initials: string[][];
  /** Groups of syllable codas that collapse onto the group's first member. */
  finals: string[][];
}

export const PHONETIC_RULES: PhoneticRuleSet = {
  initials: [
    ['x', 's'],
    ['ch', 'tr'],
    ['d', 'gi', 'r', 'v'],
    ['c', 'k', 'q'],
  ],
  finals: [
    ['n', 'ng'],
    ['t', 'c'],
  ],
};
