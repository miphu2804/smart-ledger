/**
 * Vietnamese ASR confusion rules — pure data (plan section 7.1, D2).
 *
 * This module holds only the *rule data* the confusion simulator consumes: the
 * tone inventory, the onset/coda groups ASR and dialect variation confuse, the
 * loanword respellings, and the start weights. No logic lives here; the
 * simulator that applies these lives in `synth.ts`. Kept as a `.ts` module
 * rather than `.json` so Node's type stripping and Metro can both load it with
 * no bundler plugin (see `phonetic_rules.vi.ts` for the same pattern).
 *
 * The weights are **not fitted** to real ASR output: no recorded audio or real
 * transcript exists in this repository, so the plan's "fit rule frequencies to
 * the D1 error distribution" step cannot run. They are documented start values
 * and a known deviation from plan section 7.1; `fitWeights()` in `synth.ts` is
 * the hook a later phase uses once such pairs exist.
 */

/** The eight confusion rules the simulator can fire. */
export type SynthRuleName =
  | 'tone_loss'
  | 'tone_swap'
  | 'initial_merge'
  | 'final_merge'
  | 'syllable_split'
  | 'syllable_merge'
  | 'loanword'
  | 'truncate'
  | 'char_edit';

/** Canonical rule order, used when a record reports the rules that fired. */
export const SYNTH_RULE_NAMES: SynthRuleName[] = [
  'tone_loss',
  'tone_swap',
  'initial_merge',
  'final_merge',
  'syllable_split',
  'syllable_merge',
  'loanword',
  'truncate',
  'char_edit',
];

/** Per-rule firing probability (data, not code). */
export interface SynthRuleWeights {
  tone_loss: number;
  tone_swap: number;
  initial_merge: number;
  final_merge: number;
  syllable_split: number;
  syllable_merge: number;
  loanword: number;
  truncate: number;
  char_edit: number;
}

/**
 * Documented start weights. UNFITTED — see the module header. `char_edit` here
 * mirrors the per-character probability below; the plan's start value for the
 * random character edit is 0.05.
 */
export const DEFAULT_SYNTH_WEIGHTS: SynthRuleWeights = {
  tone_loss: 0.12,
  tone_swap: 0.05,
  initial_merge: 0.08,
  final_merge: 0.06,
  syllable_split: 0.04,
  syllable_merge: 0.03,
  loanword: 0.15,
  truncate: 0.25,
  char_edit: 0.05,
};

/** Per-character edit probability (plan start value). */
export const CHAR_EDIT_P = 0.05;

/** All rule data the simulator reads. */
export interface ConfusionData {
  /** Combining tone marks (no `ngang`, which carries no mark). */
  toneMarks: string[];
  /** Vietnamese vowel base letters, including the modifier letters. */
  vowelLetters: string[];
  /** Combining marks that belong to the vowel itself (breve, circumflex, horn). */
  modifierMarks: string[];
  /** Codas that force the tone onto the last nucleus vowel. */
  finalConsonants: string[];
  /** Every valid Vietnamese onset, longest-first, so onset matching is greedy. */
  onsets: string[];
  /** Every valid Vietnamese coda, longest-first. */
  codas: string[];
  /** Onset groups ASR/dialect confuse; the first member is the canonical form. */
  initialGroups: string[][];
  /** Coda groups ASR/dialect confuse; the first member is the canonical form. */
  finalGroups: string[][];
  /** Foreign consonant clusters that trigger a syllable split ("sting" -> "xi ting"). */
  foreignOnsets: string[];
  /** Folded loanword -> Vietnamised respelling ("sting" -> "xì ting"). */
  loanwords: Record<string, string>;
  /** Folded size/unit tokens the `truncate` rule may drop from a span's tail. */
  sizeUnitTokens: string[];
}

export const CONFUSION_DATA: ConfusionData = {
  toneMarks: ['́', '̀', '̉', '̃', '̣'], // sắc huyền hỏi ngã nặng
  vowelLetters: ['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y'],
  modifierMarks: ['̆', '̂', '̛'], // breve, circumflex, horn
  finalConsonants: ['c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't'],
  onsets: [
    'ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'th', 'tr', 'qu',
    'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'x',
  ],
  codas: ['ch', 'nh', 'ng', 'c', 'm', 'n', 'p', 't'],
  initialGroups: [
    ['x', 's'],
    ['ch', 'tr'],
    ['d', 'gi', 'r', 'v'],
    ['l', 'n'],
  ],
  finalGroups: [
    ['n', 'ng'],
    ['t', 'c'],
  ],
  foreignOnsets: [
    'st', 'bl', 'cl', 'fl', 'gl', 'pl', 'sl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr',
    'sc', 'sk', 'sp', 'sw', 'tw', 'kl', 'kr', 'sn', 'sm',
  ],
  loanwords: {
    sting: 'xì ting',
    tiger: 'tai gơ',
    pepsi: 'pép si',
    'coca-cola': 'cô ca cô la',
    coca: 'cô ca',
    maggi: 'ma ghi',
    omachi: 'ô ma chi',
    aquafina: 'a qua fi na',
    chocopie: 'chô cô pai',
    vinamilk: 'vi na min',
    omo: 'ô mô',
    sunlight: 'san lai',
    vissan: 'vi san',
    ajinomoto: 'a ji nô mô tô',
    neptune: 'nep tiun',
    modern: 'mô đen',
    clear: 'cờ lia',
    'hao hao': 'hảo hảo',
    chinsu: 'chin su',
    pulppy: 'pun pi',
    ariel: 'a ri en',
    flan: 'phờ lan',
    cacao: 'ca cao',
    matcha: 'mát cha',
    st25: 'ét tê hai lăm',
    heineken: 'hai nơ ken',
    lavie: 'la vi',
    milo: 'mi lô',
    gongcha: 'gông cha',
  },
  sizeUnitTokens: [
    'chai', 'lon', 'hop', 'goi', 'loc', 'cuon', 'thung', 'bich', 'vi', 'ky', 'kg',
    'lit', 'lo', 'can', 'bao', 'tui', 'hu', 'ml', 'g', 'gr', 'gam', 'phan', 'to', 'dia', 'coc', 'trai',
  ],
};
