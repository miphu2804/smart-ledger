/**
 * The user-confirmed alias table (plan section 5.7).
 *
 * An alias is what the shop taught the resolver: "when you hear this, I meant
 * that product". It is the only learned artifact that ships in the first
 * release, and it is why the resolver gets better at one shop the longer that
 * shop uses it.
 *
 * The table stores only counts and ids. The resolver indexes each alias string
 * into the retrievers as an extra document for its product, so near-variants of
 * a learned alias also match; the table itself only decides *trust*.
 */

import type { AliasEntry } from './types.ts';

export class AliasTable {
  private readonly byFolded = new Map<string, AliasEntry>();

  constructor(entries: AliasEntry[] = []) {
    for (const entry of entries) this.byFolded.set(entry.folded, { ...entry });
  }

  /**
   * Record that the user matched `foldedSpan` to `productId`.
   *
   * Repeating the same confirmation raises the count. Pointing the same phrase
   * at a *different* product restarts the count at 1: the earlier confirmations
   * were evidence for the other product, so carrying them over would let a
   * single correction auto-apply a mapping the shop never confirmed.
   */
  confirm(foldedSpan: string, productId: string): AliasEntry {
    const existing = this.byFolded.get(foldedSpan);
    const entry: AliasEntry =
      existing && existing.productId === productId
        ? { folded: foldedSpan, productId, confirmedCount: existing.confirmedCount + 1 }
        : { folded: foldedSpan, productId, confirmedCount: 1 };
    this.byFolded.set(foldedSpan, entry);
    return entry;
  }

  /** The stored entry for a folded span, or undefined when the shop never taught it. */
  lookup(foldedSpan: string): AliasEntry | undefined {
    return this.byFolded.get(foldedSpan);
  }

  /** Whether the alias has been confirmed often enough to auto-apply. */
  isTrusted(foldedSpan: string, minConfirmations: number): boolean {
    const entry = this.byFolded.get(foldedSpan);
    return entry !== undefined && entry.confirmedCount >= minConfirmations;
  }

  /** Remove an alias. Returns whether one was there. Users can do this. */
  delete(foldedSpan: string): boolean {
    return this.byFolded.delete(foldedSpan);
  }

  /** Every alias, in insertion order. */
  entries(): AliasEntry[] {
    return [...this.byFolded.values()];
  }
}
