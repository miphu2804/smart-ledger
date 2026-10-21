/**
 * Seed aliases (plan section 5.7).
 *
 * These are the two hard-coded regex fixes the web build carries today
 * (`app/voice.tsx`): "xì ting" -> Sting and "tai gơ" -> Bia Tiger. They move
 * here as data so that removing the regexes when `VOICE_RESOLVER_V2` is on
 * loses no behavior.
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
  { folded: 'tai go', productName: 'Bia Tiger' },
];
