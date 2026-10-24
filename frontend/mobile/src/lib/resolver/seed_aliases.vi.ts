/**
 * Seed aliases (plan section 5.7).
 *
 * These are the hard-coded regex fixes the web build carries today
 * (`app/voice.tsx`): the "xì ting" family -> Sting and the "tai gơ" family ->
 * Bia Tiger, one entry per regex alternative. They move here as data so that
 * removing the regexes when `VOICE_RESOLVER_V2` is on loses as little as
 * possible. What still differs: the regex rewrites a substring anywhere in the
 * sentence, while an alias matches only a whole product span, and a seed is
 * installed only when exactly one catalog row matches its product name, so a
 * shop with two Sting flavours gets no Sting seed (picking one would be a
 * guess).
 *
 * Pure data. Keys are already folded, because that is the form the resolver
 * looks aliases up by. The value is a product *name*, not an id: ids are
 * per-shop, so the resolver resolves the name against the loaded catalog at
 * build time and drops any seed whose product is not in that catalog.
 */

export interface SeedAlias {
  /** `folded()` of the phrase the ASR is expected to produce. */
  folded: string;
  /** Catalog product name the phrase means, matched case- and accent-insensitively. */
  productName: string;
}

export const SEED_ALIASES: SeedAlias[] = [
  { folded: 'xi ting', productName: 'Sting' },
  { folded: 'xiting', productName: 'Sting' },
  { folded: 'siting', productName: 'Sting' },
  { folded: 'xi tin', productName: 'Sting' },
  { folded: 'xitin', productName: 'Sting' },
  { folded: 'tin dau', productName: 'Sting' },
  { folded: 'tai go', productName: 'Bia Tiger' },
  { folded: 'taigo', productName: 'Bia Tiger' },
  { folded: 'bia tai go', productName: 'Bia Tiger' },
];
