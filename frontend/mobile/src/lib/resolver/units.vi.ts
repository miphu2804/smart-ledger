/**
 * Selling-unit synonyms for the gate's `unit_ok` feature.
 *
 * Keys are folded unit words, from parseOrder's spoken vocabulary
 * (`UNIT_SPELLINGS`) and from the units shops type into the catalog; values are
 * one canonical name per unit. Spellings of the same unit share a value
 * (`ky`, `ki`, `kg`), and so do words a shop uses interchangeably (`ly`, `coc`;
 * `trai`, `qua`). A word missing here makes `unit_ok` unknown, not a mismatch.
 *
 * Pure data, in a `.ts` module for the same loader reason as
 * `unit_stopwords.vi.ts`.
 */

export const UNIT_CANONICAL: Readonly<Record<string, string>> = {
  ly: 'ly',
  coc: 'ly',
  o: 'o',
  chai: 'chai',
  lon: 'lon',
  goi: 'goi',
  bich: 'bich',
  tui: 'tui',
  ky: 'kg',
  ki: 'kg',
  kg: 'kg',
  hop: 'hop',
  cai: 'cai',
  chiec: 'cai',
  phan: 'phan',
  to: 'to',
  dia: 'dia',
  bo: 'bo',
  trai: 'qua',
  qua: 'qua',
  thung: 'thung',
  khay: 'khay',
  vi: 'vi',
  bao: 'bao',
  hu: 'hu',
  binh: 'binh',
  mieng: 'mieng',
  lit: 'lit',
};
