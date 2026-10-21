/**
 * Unit-word stoplist for retriever B (plan section 5.4).
 *
 * Vietnamese selling units that carry no product identity. Retriever B
 * evaluates them on and off (the bake-off's `useUnitStoplist` switch), so this
 * list is pure data: the scorer's logic only checks membership.
 *
 * Stored as a `.ts` module rather than `.json` so both Metro and Node's type
 * stripping load it with no bundler plugin and no loader attribute. Entries are
 * already in folded form (`gói` → `goi`, `hộp` → `hop`), because B tokenizes
 * `folded(text)`.
 *
 * Deliberately conservative: ambiguous words that collide with a product name
 * once folded are left out. `bó` is excluded because it folds to `bo`, the same
 * token as `bò` (beef), so dropping it would erase real names.
 */

export const UNIT_STOPWORDS: readonly string[] = [
  'chai',
  'lon',
  'goi',
  'hop',
  'loc',
  'vi',
  'thung',
  'bao',
  'bich',
  'hu',
  'binh',
  'khay',
  'ly',
  'tui',
  'chiec',
  'cai',
  'phan',
  'mieng',
  'to',
  'can',
  'kg',
  'gam',
  'ml',
  'lit',
];
