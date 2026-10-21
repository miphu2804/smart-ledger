/**
 * Retriever E — normalized Damerau-Levenshtein over the folded view
 * (plan section 5.2).
 *
 * For each candidate product E scores two views of the query span and keeps
 * the better one:
 *   (i)  `folded(span)` with spaces kept;
 *   (ii) `folded(span)` with all spaces removed.
 * Both views are precomputed for every indexed string, so a query whose
 * syllables are split or merged by the ASR ("xi ting") still reaches a catalog
 * spelling written solid ("sting"): the space-removed view makes the two
 * agree.
 *
 * Candidate set: at or below `eBruteMax` items E scores the whole catalog.
 * Above it E scores only the ids returned by `options.candidates` (how the
 * harness wires Q in front of E); with no `candidates` supplied it falls back
 * to brute force over the whole catalog.
 */

import { folded } from './normalizer.ts';
import { similarity } from './editDistance.ts';
import type { CatalogItem, QueryLine, RetrievalHit, Retriever } from './types.ts';

/** How many ids E asks a candidate provider for when the catalog is too large to brute-force. */
const E_CANDIDATES = 50;

/** The two precomputed views of one indexed string. */
interface Views {
  /** `folded(text)` with spaces kept. */
  spaced: string;
  /** `folded(text)` with all spaces removed. */
  nospace: string;
}

/** Options for `RetrieverE`. */
export interface RetrieverEOptions {
  /** Catalog size at or below which E scores every item. Default 5000 (plan start value). */
  eBruteMax?: number;
  /**
   * Candidate provider used when the catalog exceeds `eBruteMax`. Returns
   * product ids to score; `k` is how many are requested. Absent -> brute force.
   */
  candidates?: (line: QueryLine, k: number) => string[];
}

function views(text: string): Views {
  const spaced = folded(text);
  return { spaced, nospace: spaced.replace(/ /g, '') };
}

export class RetrieverE implements Retriever {
  readonly name = 'E';

  private readonly eBruteMax: number;
  private readonly candidates?: (line: QueryLine, k: number) => string[];
  private readonly docs = new Map<string, Views[]>();
  private readonly ids: string[] = [];

  constructor(catalog: CatalogItem[], options: RetrieverEOptions = {}) {
    this.eBruteMax = options.eBruteMax ?? 5000;
    this.candidates = options.candidates;
    for (const item of catalog) this.addDocument(item.name, item.id);
  }

  /** Index one extra string for a product (catalog insert or alias upsert). */
  addDocument(text: string, productId: string): void {
    let bucket = this.docs.get(productId);
    if (bucket === undefined) {
      bucket = [];
      this.docs.set(productId, bucket);
      this.ids.push(productId);
    }
    bucket.push(views(text));
  }

  retrieve(line: QueryLine, k: number): RetrievalHit[] {
    if (k <= 0 || this.ids.length === 0) return [];

    const query = views(line.rawProductSpan);
    const candidates = this.candidateIds(line);
    const hits: RetrievalHit[] = [];
    for (const productId of candidates) {
      const bucket = this.docs.get(productId);
      if (bucket === undefined) continue;
      let best = -1;
      for (const doc of bucket) {
        const spaced = similarity(query.spaced, doc.spaced);
        const nospace = similarity(query.nospace, doc.nospace);
        const score = spaced > nospace ? spaced : nospace;
        if (score > best) best = score;
      }
      hits.push({ productId, score: best });
    }

    hits.sort((x, y) => y.score - x.score || (x.productId < y.productId ? -1 : x.productId > y.productId ? 1 : 0));
    return hits.slice(0, k);
  }

  /**
   * The product ids to score: whole catalog when small, else the injected provider.
   *
   * Q's count filter is lossless for a *full-string* edit distance, so it drops a
   * short spoken span that is a prefix of a longer catalog name: "Sting dâu"
   * against "Sting dâu chai 330ml" shares 8 trigrams where the threshold asks for
   * 9. E scores that pair 0.471 against 0.167 for the nearest distractor, so it
   * would rank it first, but above `eBruteMax` it only ever sees what Q handed it.
   * An empty provider therefore means "Q found nothing", not "nothing matches",
   * and the honest answer is to scan rather than report a miss.
   */
  private candidateIds(line: QueryLine): string[] {
    if (this.ids.length <= this.eBruteMax) return this.ids;
    if (this.candidates === undefined) return this.ids;
    const provided = this.candidates(line, E_CANDIDATES);
    return provided.length === 0 ? this.ids : provided;
  }
}
