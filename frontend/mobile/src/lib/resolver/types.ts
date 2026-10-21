/**
 * Frozen shared types for the voice-order resolver.
 *
 * This file is the interface seam between the retriever implementations
 * (normalizer, edit distance, trigram index, syllable BM25), the fusion and
 * gate layers, and the offline evaluation harness. Treat it as read-only:
 * extend it only by adding optional fields, never by changing an existing
 * field's meaning.
 *
 * Every component is pure TypeScript with no runtime dependency, so the same
 * module runs under React Native (Android/web app) and under Node (eval runner).
 */

/** A catalog row the resolver may match against. Mirrors `products` in the DB. */
export interface CatalogItem {
  id: string;
  /** Display name, original Vietnamese spelling. */
  name: string;
  /** Selling unit, e.g. "chai". Used by the gate's `unit_ok` feature. */
  unit?: string;
  brand?: string;
  /**
   * Near-duplicate grouping key (brand x flavour x size family). Two items in
   * the same family are hard negatives for each other; used by the D3 catalog
   * generator and by evaluation breakdowns.
   */
  family?: string;
}

/** A user-confirmed alias. `folded` is the normalizer's folded view of the heard span. */
export interface AliasEntry {
  folded: string;
  productId: string;
  confirmedCount: number;
}

/** One parsed order line, as produced by `parseOrder.ts`. */
export interface QueryLine {
  /** The raw product span after quantity and unit have been stripped. */
  rawProductSpan: string;
  qty?: number;
  unit?: string | null;
}

/** The three normalizer views (plan section 5.1). */
export type ViewName = 'toned' | 'folded' | 'phon';

/** One retriever's opinion about one candidate. */
export interface RetrievalHit {
  productId: string;
  score: number;
}

/**
 * A retriever is built once from the catalog and then queried.
 *
 * `retrieve` returns at most `k` hits, best first, with scores that are
 * comparable within this retriever only. Fusion is responsible for making
 * scores comparable across retrievers.
 */
export interface Retriever {
  readonly name: string;
  retrieve(line: QueryLine, k: number): RetrievalHit[];
  /** Index one extra string for a product (catalog insert or alias upsert). */
  addDocument(text: string, productId: string): void;
}

/** A candidate after fusion, carrying its per-retriever provenance. */
export interface Candidate {
  productId: string;
  /** Fused score. Comparable across candidates of the same query only. */
  score: number;
  /** Raw score per retriever name. Missing key means the retriever did not return it. */
  scores: Record<string, number>;
  /** 1-based rank per retriever name. Missing key means the retriever did not return it. */
  ranks: Record<string, number>;
}

/** Whether the parsed unit agrees with the candidate's catalog unit. */
export type UnitCompatibility = 'ok' | 'mismatch' | 'unknown';

/** Gate features (plan section 5.6). */
export interface GateFeatures {
  /** Fused score of the top-1 candidate. */
  s1: number;
  /** Fused score of the top-2 candidate, equal to `s1` when only one candidate exists. */
  s2: number;
  /** `s1 - s2`. */
  margin: number;
  /** Standard deviation of the top-K fused scores. */
  disp: number;
  /** Share of retrievers whose top-1 is the fused top-1, in [0, 1]. */
  agree: number;
  /** Jaccard overlap of the top-K id sets of retrievers E and Q, in [0, 1]. */
  jacc: number;
  unit_ok: UnitCompatibility;
  /** 1 when the top-1 was reached through a confirmed alias. */
  alias: 0 | 1;
  /** Query length in syllables. */
  len_q: number;
  /** Token-level ASR confidence when the binding exposes it, else null. */
  stt_conf: number | null;
}

export type Decision = 'AUTO' | 'ASK' | 'NEW';

/** The resolver's answer for one order line. */
export interface ResolveResult {
  decision: Decision;
  /** Set only when `decision === 'AUTO'`. */
  productId: string | null;
  /** Top-K candidates, best first, used to populate the disambiguation dialog. */
  topK: Candidate[];
  features: GateFeatures;
}

/** Retriever names the config may enable. `AND` is the historical control. */
export type RetrieverName = 'E' | 'Q-cos' | 'Q-bm25' | 'B' | 'P' | 'AND';

/** Fusion variants (plan section 5.5). */
export type FusionName = 'max' | 'rrf' | 'wrrf' | 'linear';

export type GateName = 'G1' | 'G2';

/** Everything that varies between bake-off configs. */
export interface ResolverConfig {
  retrievers: RetrieverName[];
  fusion: FusionName;
  /** RRF constant, start 60. */
  rrfK: number;
  /** Per-retriever weights for `wrrf` and `linear`. Tuned on the calibration split only. */
  weights: Record<string, number>;
  /** Number of candidates kept after fusion. */
  topK: number;
  /** Max edit distance the Q count filter guarantees lossless for, start 2. */
  qMaxEditDistance: number;
  /** Catalog size at or below which E brute-forces the whole catalog, start 5000. */
  eBruteMax: number;
  /** Whether B drops unit words (`chai`, `lon`, ...) before scoring. */
  useUnitStoplist: boolean;
}

/** G1 rule thresholds. */
export interface GateRules {
  sFloor: number;
  sAuto: number;
  mMin: number;
}

/** G2 logistic weights plus its isotonic calibration map. */
export interface GateModel {
  /** Feature order is fixed; see `GATE_FEATURE_ORDER`. */
  weights: number[];
  bias: number;
  /** Monotone calibration map as (raw, calibrated) breakpoints. */
  calibration: Array<[number, number]>;
}

/** Feature order for `GateModel.weights`, frozen so a shipped JSON stays readable. */
export const GATE_FEATURE_ORDER = [
  's1',
  'margin',
  'disp',
  'agree',
  'jacc',
  'unit_ok',
  'alias',
  'len_q',
  'stt_conf',
] as const;

/** Gate configuration as shipped in `config/gate.json`. */
export interface GateConfig {
  gate: GateName;
  rules: GateRules;
  model: GateModel | null;
  /** AUTO when p >= thetaAuto. */
  thetaAuto: number;
  /** NEW when s1 < sFloor. */
  sFloor: number;
  /** Alias trust threshold. */
  aliasMinConfirmations: number;
}

/** The resolver handle returned by `buildResolver`. */
export interface Resolver {
  resolve(line: QueryLine): ResolveResult;
  /** Synchronous index update (plan section 5.3, freshness). */
  upsertAlias(entry: AliasEntry): void;
}
