# PLAN v3.1 — Voice Order Product Resolution: Algorithms + Evaluation (SmartLedger mobile)

> Audience: a coding agent executing inside the SmartLedger repo.
> Read §0–§4 before writing code.
> Every number marked *(start)* is an initial value to be calibrated or confirmed, never a final value.
>
> This version replaces v2. What changed:
> - The architecture is **chosen by a pre-registered bake-off**, not assumed.
> - Candidate algorithms come only from the cited research (Zobel 1993, Ukkonen 1992, Cursor 2026, Qdrant weak-retrieval and hybrid search) plus classic string metrics.
> - **No GLiNER / LLM / hosted API.**
> - Qdrant Edge is used as the **reference implementation in the offline eval harness**. It is not shipped in the app unless §11 conditions are met.
> - v3.1 adds two optional improvement modes after P7:
>   - **P8 continuous learning:** small models retrained weekly from opt-in user corrections (§9A).
>   - **P9 bounded agent optimization loop:** a coding agent runs 10 eval-gated iterations on fixed data, for when continuous learning is not needed (§9B).
>   - **P9-QD:** a conditional quality-diversity variant of P9, adapted from QD-Rec without an LLM judge (§9C).

---

## 0. Problem statement and system classification

**Input.** A Vietnamese transcript from on-device sherpa-onnx streaming Zipformer transducer (Android), or from the Web Speech API (web). It is segmented by `parseOrder.ts` into order lines `{rawProductSpan, qty, unit}`.

**Output per line.** One of:
- `AUTO(productId)` → written to the order
- `ASK(top-3 candidates)` → existing disambiguation dialog
- `NEW` → existing add-to-catalog dialog

**Core sub-problem.** Approximate matching of a noisy, ASR-produced Vietnamese span against a small shop catalog (assumed 10²–10⁴ items; verify), under three requirements:
1. **Safety:** never silently pick the wrong product.
2. **Latency:** imperceptible on a low-end Android device.
3. **Self-improvement:** learn from user corrections.

**Classification.** On-device **workflow automation with a retrieval step**.
- No agent, no planner, no LLM.
- **No model training or fine-tuning.** The STT model license is CC BY-NC-ND 4.0, so derivatives are excluded.
- The only learned artifacts are (a) a user-confirmed alias table and (b) gate parameters fitted on labeled traces. Gate option G2 is a tiny logistic regression; this counts as *training a ~10-parameter classifier*, and is reported as such.

**Non-goals.** Server calls in the hot path, vector DB in the app, STT model replacement (separate license track), iOS, any change to expense semantics (NFR-006 / AC-010).

---

## 1. Verified current state (from repo inspection)

- **Android flow.**
  1. `app/voice.tsx` → `speechEngine.prepare()` (`src/lib/speech/sherpaEngine.ts`). Model: ~30M-param Vietnamese streaming Zipformer transducer, ~49 MB, bundled or downloaded from R2 with byte check. Config: `greedy_search`, endpointing on, 2 CPU threads.
  2. Hold orb → 16 kHz mono PCM chunks → sequential `processAudioChunk`. Endpoint → finalize + `reset()`.
  3. Release → stop mic → drain queue → 0.5 s silence pad → `inputFinished` → decode → `getResult()`.
  4. `handleUtterance` → `parseOrder()` (785 lines, pure TS) → items / unknown / missing qty / disambiguations / expenses.
- **Web.** Web Speech API vi-VN + two hard-coded regex fixes ("xì ting" → Sting, "tai gơ" → Bia Tiger).
- **Dead code.** `frontend/mobile/src/sst/` (17 files, never imported). Duplicate parser and a hotword trie; `cloud_fallback` targets a non-existent endpoint.
- **Hotwords** not used; `bpe.model` not loaded.
- **iOS** unsupported.
- **Not yet measured:** real-device recognition quality; end-to-end latency of the release step.

---

## 2. Research basis → algorithm decisions

| Source | Idea used | Where it lands |
|---|---|---|
| Zobel, Moffat, Sacks-Davis 1993 | Inverted index over character n-grams of a lexicon; candidates are cheap to verify in memory, so the index can be a *coarse* filter; boundary markers reduce false matches | Q retriever index layout (§5.3), boundary padding |
| Ukkonen 1992 | q-gram distance lower-bounds edit distance; strings within edit distance k share ≥ `max(|x|,|y|) − q + 1 − k·q` q-grams → **count filter**, not AND | Q candidate pruning with a provable no-loss bound for k ≤ K (§5.3) |
| Cursor 2026 (fast regex search) | AND-style n-gram filtering is exact-match oriented; **rare n-grams carry more selectivity** (frequency-weighted); index must be **fresh (read-your-own-writes)** and live **next to the verifier** (client-side) | IDF weighting of trigrams; synchronous index update on alias/catalog write; on-device placement |
| Qdrant: hybrid queries | Fuse heterogeneous retrievers by rank (RRF, weighted RRF); tune weights on a train split, measure on a held-out split | Fusion F (§5.5) |
| Qdrant: predicting weak retrieval | Cheap no-LLM signals (top score height, dispersion, retriever disagreement, evidence coverage) decide when to escalate; abstain when evidence is missing | Gate features and decision (§5.6) |
| Qdrant Edge (beta) | Embedded sparse/BM25 engine with IDF and `ascii_folding`; Python + Rust bindings only | Offline **reference implementation** + parity oracle (§7.5) |

**Explicit rejection, with reason:** pure AND n-gram filtering (Zobel/Cursor style) for resolution. A single mis-heard character removes the correct candidate ("stink" lacks the trigram "ink" that "sting" doesn't have, and vice versa). It is kept only as a historical baseline.

---

## 3. Target architecture (after bake-off; components are pluggable)

```
Catalog + aliases ──► Index builder (incremental) ──► in-memory indexes (E, Q, B, P)
       ▲                                                     │
       │ alias upsert (sync, read-your-own-writes)           │
       │                                                     ▼
STT ──► parseOrder (segmentation, qty, unit) ──► Normalizer N ──► Retrievers ──► Fusion F ──► Gate G ──► AUTO/ASK/NEW
 ▲                                                                                                   │
 └── hotwords.txt (generated from catalog, flag) ◄──── feedback (user choice in ASK/NEW) ◄───────────┘
```

All resolver components are pure TypeScript functions in a shared package used by both Android and web. No network.

---

## 4. Rules for the executing agent

1. Phases are ordered. **Phase 2 (eval harness) must exist before any algorithm is integrated into the app.**
2. TDD. Every algorithm has unit tests with hand-computed expected values (§5 gives several).
3. All app behavior changes go behind flags (§12), default off. With flags off, behavior is byte-identical to today.
4. One PR per phase. The PR body contains measured numbers and confidence intervals, not adjectives.
5. Selection is by the **pre-registered rule in §8**. Do not change the rule after seeing results. If a change is justified, record it as a deviation with its reason.
6. No new runtime dependency in the app without justification in `docs/voice-resolution/DISCOVERY.md`. Dev/eval dependencies (Python: `qdrant-edge-py`, `sherpa-onnx`, `jiwer`, `numpy`, `scipy`) are allowed in `eval/`.
7. Never upload raw utterances or audio to remote services. Eval data stays in the repo or a private bucket the owner controls; obtain speaker consent for recordings.
8. Contradictions between plan and code → stop, record under "Open questions" in DISCOVERY.

---

## 5. Algorithms (specification)

Notation: catalog `C = {c₁…c_N}`; each item has `name`, `unit?`, `brand?`; aliases `A` map strings to `productId`. Query `q` = raw product span from `parseOrder`.

### 5.1 Normalizer N — Vietnamese-aware, produces three views

| View | Definition | Used by |
|---|---|---|
| `toned` | NFC; lowercase; punctuation → space; collapse spaces; **canonical tone-mark placement** (choose one convention, e.g. "hoà" vs "hòa", and convert both to it, because NFC does not unify these); unify `kỹ/kĩ`-type i/y only where the catalog shows both | display, tie-break |
| `folded` | `toned` with all diacritics removed; **`đ→d` mapped explicitly** (NFD + strip combining marks does not handle `đ`) | E, Q, B |
| `phon` *(optional, P retriever)* | `folded` syllables mapped by a Vietnamese phonetic key: merge initials that dialect/ASR confuse (`x/s`, `ch/tr`, `d/gi/r/v`, `c/k/q`), merge finals (`n/ng`, `t/c`), drop tones (already folded) | P |

Required tests:
- "Sting Dâu" → folded `sting dau`
- "Đường" → `duong`
- NFD input ≡ NFC input
- "hòa" ≡ "hoà" in `toned`
- `phon("xì ting") == phon("sì ting")`

The `phon` mapping rules live in a **data file** (`phonetic_rules.vi.json`), not inline code.

### 5.2 Retriever E — normalized Damerau-Levenshtein (edit distance)

- Compute `sim_E(q, c) = 1 − DL(a, b) / max(|a|, |b|)` on two strings and take the max:
  - (i) `folded` with spaces
  - (ii) `folded` with spaces removed — handles syllable split/merge such as "xi ting" ↔ "sting"
- Candidate set: **Q runs first; E scores only Q's top `E_CANDIDATES` *(start 50)***. Brute force over all of C only if N ≤ `E_BRUTE_MAX` *(start 500)*.
  - Q's count filter is lossless for edit distance ≤ K, so this ordering does not drop near matches.
- Why: React Native runs JS on **Hermes**, which executes precompiled bytecode **without a JIT**. Tight DP loops are much slower than on desktop V8.
  - Full brute force at N = 5000, L ≈ 15, 3 lines ≈ 3.4M DP cells, estimated ~70–340 ms on a low-end device (rough, unmeasured). This would blow the §7.4 budget.
  - With 50 candidates the same work is ~34k cells.
- Optional bit-parallel Myers for O(N·L) if the profile still shows a need.
- Hand-computed test: `"xiting"` vs `"sting"`: DL = 2 (substitute x→s, delete i) → sim = 1 − 2/6 = 0.667.

### 5.3 Retriever Q — character-trigram index with IDF weighting and count filter

**Index (Zobel layout).**
- For each indexed string (catalog names **and** alias strings, each pointing to a productId), compute the padded trigrams of the space-removed folded string. Padding: `"##" + s + "#"`.
- Store posting lists `trigram → [docId…]` and `df(t)`.
- `idf(t) = ln((N_docs − df + 0.5)/(df + 0.5) + 1)` (BM25-style, non-negative) — the rare-n-gram weighting idea from Cursor.

**Candidate generation (Ukkonen count filter).**
- For query trigram set Tq, accumulate per-document `shared = |Tq ∩ Td|` via posting lists.
- Keep documents with `shared ≥ τ(q, d, K) = max(|q|,|d|) − 3 + 1 − 3K`, where K *(start 2)* is the max edit distance to guarantee.
- Documents failing the bound cannot be within edit distance K, so pruning is **lossless for k ≤ K**.
- If τ ≤ 0, fall back to scoring all documents sharing ≥ 1 trigram.
- **Never intersect posting lists** (no AND).

**Scoring.** Two variants, both evaluated:
- `Q-cos`: IDF-weighted cosine between trigram tf vectors.
- `Q-bm25`: BM25 over trigram "tokens", with `k1 = 1.2`, `b = 0.75`, and `avg_len` = mean trigram count of the catalog. **Do not use a document-corpus default such as 256.**

**Hand-computed test (padded, space-removed, folded).**
- `"stink"` → `##s #st sti tin ink nk#`
- `"sting"` → `##s #st sti tin ing ng#`
- shared = 4, so with K = 2: τ = max(5,5) − 2 − 6 < 0. The pair is retained.

**Freshness (Cursor).**
- Insert/update of a catalog item or alias updates posting lists and `df` **synchronously**.
- Full rebuild only on catalog import.
- IDF drift from incremental updates is tolerated. Recompute IDF lazily when `|Δdocs| > 5%`.

### 5.4 Retriever B — syllable-level BM25 (handles word order and extra words)

- Tokens = whitespace-separated syllables of `folded`. No stemming, no stopwords (Vietnamese is isolating).
- Optional unit-word stoplist (`chai, lon, gói, hộp…`) as **data**, evaluated on vs off.
- Standard BM25 (`k1 = 1.2`, `b = 0.75`, `avg_len` from the catalog).
- Example: "dâu sting" ↔ "sting dâu" scores like an exact token match. E would penalize the swap.

### 5.5 Retriever P (optional) and Fusion F

- **P:** exact/E-score on the `phon` view. Enabled only if the bake-off shows a gain on loanword and dialect tags.
- **Fusion variants** (all evaluated):
  - F1 `max` of normalized scores
  - F2 **RRF**: `Σ_r 1/(k + rank_r)` with k *(start 60)*
  - F3 **weighted RRF**, weights tuned on the train split only
  - F4 linear blend of min-max-normalized scores (expected to be weaker; Qdrant notes raw-score blending is unreliable without normalization — kept as a control)
- Output: top-K *(start 5)* candidates with fused score `s` and per-retriever ranks.

### 5.6 Gate G — weak-retrieval detection (Qdrant signals, adapted)

**Features per line.**

| Feature | Definition | Qdrant family |
|---|---|---|
| `s1` | fused score of top-1, normalized to [0,1] | height |
| `margin` | `s1 − s2` | height/dispersion |
| `disp` | std of top-K fused scores | dispersion |
| `agree` | 1 if top-1 is identical across E, Q, B; else fraction of retrievers agreeing | divergence (inverse) |
| `jacc` | Jaccard of top-K id sets between E and Q | divergence (inverse) |
| `unit_ok` | parsed unit compatible with top-1's unit (true/false/unknown) | evidence coverage |
| `alias` | top-1 reached via confirmed alias (count ≥ `ALIAS_MIN_CONFIRMATIONS`) | evidence |
| `len_q` | query length in syllables | context |
| `stt_conf` | token-level confidence if the sherpa binding exposes it, else missing | ASR evidence |

**Decision variants.**
- **G1 rules** (grid-searched thresholds):
  - `alias → AUTO`
  - else `s1 < s_floor → NEW`
  - else `s1 ≥ s_auto ∧ margin ≥ m_min ∧ agree = 1 ∧ unit_ok ≠ false → AUTO`
  - else `ASK`
- **G2 logistic regression** on the features → `p(correct top-1)`, calibrated (Platt/isotonic on the calibration split):
  - `AUTO` if `p ≥ θ_auto`
  - `NEW` if `s1 < s_floor`
  - else `ASK`
  - Weights ship as JSON (~10 floats); inference is one dot product in TS.

**Objective for both.** Choose parameters on the calibration split to **minimize ask_rate subject to false_auto_rate ≤ FAR_MAX** *(start 1%)*. Report on the held-out split.

### 5.7 Alias learning

- On ASK resolution or NEW creation, if `folded(q) ≠ folded(product.name)`: upsert alias `(shopId, folded(q)) → productId`, `confirmedCount += 1`.
- Also **insert the alias string into the Q/B/E indexes as an extra document** for that product. Near-variants of a learned alias are then also matched.
- An alias auto-applies (feature `alias`) only after `ALIAS_MIN_CONFIRMATIONS` *(start 2)*.
- Users can delete aliases.
- Seed aliases: the two web regex cases, as a **data file**.

### 5.8 STT contextual biasing (orthogonal axis)

- sherpa-onnx hotwords (transducer-only; requires `modified_beam_search` and BPE tokenization info).
- Hotword list = top `HOTWORDS_MAX` *(start 50)* catalog names by frequency + recency, generated as data.
- Blocked until the owner answers the license question about shipping the tokenizer file (§10).

---

## 6. Phase plan

| Phase | Goal | Key outputs | Done when |
|---|---|---|---|
| **P0** Discovery + instrumentation | Facts and timing | `DISCOVERY.md` (parseOrder matching rules, catalog source and size distribution, binding API for hotwords/confidence, model tokenizer files, license text); per-utterance timestamps `t_release, t_mic_stopped, t_queue_drained, t_decode_done, t_result, t_parse_done, t_resolve_done, t_ui_committed` | Traces captured on 2 device tiers |
| **P1** Single source of truth | Remove parser drift | Golden suite from `src/sst/order_parser` + existing tests + web regex cases; delete `src/sst/` | All green; divergences documented, not silently fixed |
| **P2** Eval harness + datasets | Measurement before building | §7 datasets D1–D3, metric library, report generator, Python reference (Qdrant Edge) | `eval/run.py --config baseline` produces a full report with CIs |
| **P3** Algorithm library (TS) | Implement §5 | `@smartledger/resolver`: N, E, Q (both scorers), B, P, F1–F4, G1/G2, alias index updates; Node runner for the harness | Unit tests incl. hand-computed values; **parity test vs Qdrant Edge ≥ 99% top-5 identity on D2** (§7.5) |
| **P4** Offline bake-off | Pick resolver + gate | Matrix §8.1 over D1-text, D2, D3; selection per §8.3 | Signed-off report `eval/reports/bakeoff_v1.md` |
| **P5** STT axis (on device) | Measure biasing and tail latency | greedy vs beam vs beam+hotwords on D1 audio; RTF, latency, false insertions. Also: (a) silence pad 0.5 s vs 0.3 s vs 0.2 s, measuring tail latency and final-word deletion rate; (b) **overlapped processing**: run parse + resolve on each endpoint-finalized sentence while the orb is still held, so release only processes the last sentence | Report; go/no-go per §8.3 budgets; adopt the smallest pad with no significant final-word deletion increase |
| **P6** Integrate winner | Ship behind flags | Index builder, incremental updates, gate config JSON, feedback loop, trace ring buffer | Integration tests: ASK → pick → repeat → AUTO after N confirmations |
| **P7** Shadow + rollout | Validate on real usage | Shadow mode (compute + log, UI unchanged) for 1–2 weeks; recalibrate; enable | Shadow metrics within CIs of bake-off |
| **P8** *(optional)* Continuous learning | Improve from real corrections | Opt-in trace upload, weekly train job, champion/challenger eval, staged config rollout with rollback (§9A) | First challenger promoted or rejected by the §9A.5 rule, with report |
| **P9** *(optional)* Agent optimization loop | Improve without new data | 10-iteration bounded loop on fixed D1–D3, protected eval, single lockbox test (§9B) | PR with iteration log; lockbox result per §8.3 |
| **P9-QD** *(conditional)* Quality-diversity loop | Escape a P9 plateau | Niche archive, bandit niche selection, mutate/crossover/explore, Thresholdout feedback (§9C) | PR with archive + lineage; single lockbox test |

---

## 7. Evaluation design

### 7.1 Datasets

**D1 — real audio (primary, ground truth).**
- Protocol: recorded on device through the real pipeline, plus a raw 16 kHz WAV copy. Each item stores reference transcript, gold order lines, and tags.
- Size: ≥ 300 utterances *(start; target 500)* from ≥ 12 speakers.
- Stratification:
  - **region** (Bắc / Trung / Nam, ≥ 3 speakers each)
  - gender
  - **environment** (quiet / shop noise)
  - **device tier** (low / mid)
  - utterance type (single line, multi-line, brand loanword, native Vietnamese name, numbers/quantities, units, **out-of-catalog item**)
- ≥ 10% of utterances must contain an out-of-catalog item, so that NEW precision/recall is measurable.

**D2 — synthetic ASR-noise text (resolver scale and power).**
- Generated from real catalogs by a rule-based **confusion simulator** (rules as data):
  - tone loss / tone swap
  - initial merges (`x/s, ch/tr, d/gi/r/v, l/n`)
  - final merges (`n/ng, t/c`)
  - syllable split/merge
  - loanword Vietnamization ("sting" → "xì ting")
  - random char edit with p *(start 0.05)*
- Rule frequencies are **fitted to the error distribution observed in D1** (P2 task), so D2 mirrors reality.
- Reported separately; never the only basis for a decision.

**D3 — catalog stress.**
- Synthetic catalogs of N ∈ {100, 1k, 5k, 20k}, built with **near-duplicate families** (same brand × flavor × size, e.g. "Sting dâu 330ml" / "Sting dâu 500ml" / "Sting nhân sâm").
- Used for latency/memory scaling and confusion-under-crowding.

**Splits.** Group split **by speaker and by product family** into calibration (60%) and held-out test (40%). This prevents leakage of a speaker's voice or a product's aliases across splits. All tuning (weights, thresholds, G2) uses calibration only.

### 7.2 Metrics

**STT quality (Vietnamese-specific).**

| Metric | Definition |
|---|---|
| `SER` | syllable error rate (WER over whitespace-separated syllables; the natural unit for Vietnamese) |
| `CER` | character error rate on `toned` |
| `TER` | **tone error rate**: syllables wrong in `toned` but correct in `folded` |
| `PNER` | product-name entity error rate: utterances where the gold product's name span is mis-transcribed |
| `HFIR` | hotword false-insertion rate (P5 only) |

**Resolution quality.**

| Metric | Definition |
|---|---|
| `top1`, `recall@3`, `MRR` | vs gold productId, in-catalog lines only |
| `FAR` (false_auto_rate) | wrong AUTO / all lines — **primary safety metric** |
| `ask_rate` | ASK / all lines |
| `new_P`, `new_R` | precision/recall of NEW against out-of-catalog gold |
| `AURC` | area under the risk–coverage curve of the gate score (selective-prediction quality; lower is better) |
| `ECE` | expected calibration error of G2 probabilities (10 bins) |

**End-to-end.**
- `order_EM`: whole order exactly correct (product, qty, unit, all lines)
- line-level F1
- `taps_per_order`: expected extra user taps (ASK = 1, NEW = 2–3; constants documented)

**Latency and resources** (on device, per tier).
- p50/p95/p99 of each segment: `release→decode_done`, `decode→result`, `parse`, `resolve`, `ui_commit`
- `RTF` = decode time / audio duration
- cold `prepare()` time
- index build time (full; incremental per alias)
- RSS delta
- APK/AAB size delta

### 7.3 Statistics

- Report **95% bootstrap CIs** (10k resamples, resampling utterances, stratified by speaker) for every rate.
- Paired comparisons between architectures on the same items: **McNemar's test** on top-1 correctness and on AUTO-correctness.
- **FAR evidence rule:** zero wrong AUTOs in n AUTO decisions gives a 95% upper bound ≈ 3/n (rule of three). Claiming FAR ≤ 1% therefore needs ≥ 300 AUTO decisions in the held-out split. If D1 is smaller, report the bound honestly and rely on P7 shadow data before enabling.
- Breakdowns are mandatory: region, environment, device tier, tag (loanword, out-of-catalog, multi-line), catalog-size bucket.

### 7.4 Latency budgets *(start; owner confirms)*

| Budget | Value |
|---|---|
| `resolve` p95, N ≤ 5k, low-end device | ≤ 15 ms per utterance |
| incremental index update per alias | ≤ 5 ms |
| full build, N = 5k | ≤ 300 ms total, built at catalog load in chunks that yield to the JS thread (never on orb release) |
| resolver RSS | ≤ 15 MB at N = 5k |
| release→UI p95, low-end | ≤ baseline + 150 ms when hotwords are on; ≤ baseline + 30 ms otherwise |
| APK delta | ≤ 1 MB (excluding any tokenizer file) |

### 7.5 Qdrant Edge reference and parity

- In `eval/reference/qdrant_edge_ref.py`, build an Edge Shard per catalog with:
  - (a) sparse vector `tri` with `Modifier.Idf`, documents = space-joined padded trigram tokens embedded by the built-in BM25 embedder (`tokenizer="whitespace"`, no stemming/stopwords, `avg_len` = catalog mean)
  - (b) sparse vector `syl` = BM25 over syllables with `ascii_folding=True`
  - (c) fusion via RRF
- **Parity test** (CI-gated): TS `Q-bm25`, `B`, `F2` vs the reference on D2 queries.
  - Pass: top-5 id sequence identical on ≥ 99% of queries.
  - Score correlation ρ ≥ 0.99.
  - Each mismatch logged with both rankings.
- Qdrant Edge is beta; pin the package version and record it in the report.

### 7.6 Report format (`eval/reports/<run_id>.md`)

1. Config hash and dataset versions
2. Headline table with CIs
3. Breakdowns
4. Risk–coverage curves
5. Latency table per device
6. Failure gallery: 20 worst lines with all retriever ranks
7. Deviations from the pre-registered rule

---

## 8. Bake-off

### 8.1 Matrix

| Axis | Levels |
|---|---|
| STT (P5, on device) | S0 greedy · S1 modified beam · S2 beam + hotwords |
| Resolver (P4, offline on D1 transcripts from S0, plus D2, D3) | R0 current `parseOrder` matching · R1 E only · R2 Q-cos · R3 Q-bm25 · R4 Q + B (F2) · R5 E + Q + B (F2/F3) · R6 R5 + P · Rx AND-trigram (historical control, expected to fail on noisy names) |
| Gate | G1 rules · G2 logistic |

### 8.2 Execution

- Offline first (P4), then rerun the top 2 resolver×gate configs on S1/S2 transcripts (P5).
- Every run is reproducible from `eval/configs/*.yaml`.

### 8.3 Pre-registered selection rule

1. **Exclude** any config violating a §7.4 budget on the low-end device.
2. **Exclude** any config whose held-out FAR 95% upper bound > `FAR_MAX`.
3. Among the rest, take the config with the best `recall@3`. Call it R*.
4. **Choose the simplest config** whose `recall@3` and `ask_rate` are each within **2 percentage points** of R*. Simplicity order: R1 < R2 < R3 < R4 < R5 < R6; G1 < G2.
5. For STT: adopt S2 only if PNER drops by ≥ 20% relative with non-overlapping CIs, **and** HFIR ≤ 1%, **and** the latency budget holds. Otherwise stay on S0.

---

## 9. Integration details (P6)

- **Catalog on device.** "No network" means *no network call in the voice hot path*, not an offline-only app.
  - The resolver reads a **local replica** of the shop catalog and alias table (the store `parseOrder` already uses; P0.1 confirms which). The server (Postgres) stays the source of truth.
  - **Sync:** background delta sync by `updated_at` whenever online. Never on orb release.
  - **Offline writes:** products and aliases created while offline are written locally first, so the index sees them immediately, and also queued for upload. Client-generated UUIDs.
  - **Conflicts:** server wins on product fields. Duplicate products created on two devices are merged by normalized name into one `product_id`, and aliases are re-pointed to it.
  - **Staleness:** record `catalog_synced_at`. If older than `CATALOG_STALE_DAYS` *(start 7)*, still resolve, but log it in the trace so eval can segment by staleness.
- `ResolverIndex` lives in memory, built from the local replica at catalog load, in chunks that yield to the JS thread. It subscribes to catalog/alias store changes for synchronous incremental updates.
- Gate parameters ship as `config/gate.json` (thresholds or LR weights + calibration map) and are versioned.
- Mapping to existing outcomes: AUTO → `items`; ASK → `disambiguations` (top-3, none preselected); NEW → `unknown`.
- Web uses the same package. The two regex fixes are removed when `VOICE_RESOLVER_V2=true`; the seed alias file covers them.
- Trace ring buffer (on device, last 1,000 lines): `{ts, q_folded, candidates+ranks per retriever, features, decision, userAction, finalProductId, latency}`. Export only by explicit user/developer action.

---

## 9A. P8 — Continuous learning (optional)

**When to use.** Opt-in traces reach ≥ `CL_MIN_EVENTS` *(start 500)* labeled lines per week, across ≥ 5 shops. Below that, use P9 instead.

**Classification.** This phase **trains small models**: a logistic regression, a learned edit-cost table, and a small learning-to-rank model. All of them train on CPU in seconds to minutes. All of them ship as **JSON parameters** loaded by the existing TS resolver. No new on-device runtime. No STT fine-tuning.

### 9A.1 What is learned, in order of priority

| # | Model | Learns | Algorithm | Labels from | Ships as |
|---|---|---|---|---|---|
| L1 | Gate | p(top-1 correct) from §5.6 features | Logistic regression + isotonic calibration | ASK choices, NEW, exploration samples, implicit negatives | `gate.json` (weights + calibration map) |
| L2 | Edit costs | Per-pair substitution/insert/delete costs for folded characters and syllable pieces (e.g. `x→s` cheap) | Stochastic edit distance trained by EM on (heard, true) string pairs — Ristad & Yianilos 1998 | (folded raw span, folded chosen product name) pairs | `edit_costs.json`, consumed by retriever E as weighted DL; replaces hand-written `phonetic_rules.vi.json` only if it wins |
| L3 | Ranker | Weights over per-candidate features (sim_E, sim_Q, sim_B, alias count, unit_ok, purchase prior, recency) | Pointwise LR or small GBDT exported to JSON trees; replaces fixed RRF only if it wins | ASK choices with position-bias correction (§9A.2) | `ranker.json` |
| L4 *(conditional)* | STT language model | Order phrasing | RNN LM (icefall) + LODR bigram correction in sherpa-onnx `modified_beam_search` | Opt-in order text | ONNX LM file — **only if** PNER stays high on non-name tokens after hotwords, the RN binding exposes LM config, and the owner clears license questions |

**KenLM is not used.** sherpa-onnx's online LM slot expects an RNN LM in ONNX. LODR is a correction term subtracted *alongside* an external LM; it does not work on its own.

### 9A.2 Label quality (mandatory)

- **Selective labels.** AUTO decisions are rarely corrected, so training only on ASK events biases the model toward over-confidence (Lakkaraju et al., KDD 2017). Mitigations:
  - **Exploration:** route a random `CL_EXPLORE_RATE` *(start 3%)* of would-be-AUTO lines to ASK. Log the propensity.
  - **Implicit negatives:** a user removing or changing an AUTO line before checkout = negative label for that AUTO.
- **Position bias in ASK.** Users favor the first candidate. Shuffle the order of candidates 2–3 for a random `CL_SHUFFLE_RATE` *(start 10%)* of ASK dialogs. Train L3 with inverse-propensity weighting (Joachims, Swaminathan, Schnabel, WSDM 2017).
- **Privacy.** L1 and L3 need numeric features plus productId only. L2 and L4 need folded strings and therefore require explicit opt-in consent. Never upload audio.

### 9A.3 Weekly pipeline

```
opt-in traces ─► snapshot (versioned) ─► train L1..L3 challengers ─► eval ─► promote? ─► config rollout
```

- **Scheduler:** cron or a scheduled GitHub Actions workflow is sufficient for one weekly job. Airflow only if several dependent pipelines appear.
- **Tracking:** dataset snapshots versioned (e.g. DVC); runs and artifacts in a registry (e.g. MLflow). Each artifact records its training data hash and code commit.

### 9A.4 Evaluation for challengers

- **Time split:** train on weeks 1..t, test on week t+1. Never shuffle across time; catalogs and aliases drift.
- Also evaluate on the frozen **D1 held-out** split from §7.1 as a fixed anchor.
- Metrics and statistics exactly as §7.2–§7.3 (bootstrap CIs, McNemar vs champion, FAR upper bound).
- Use inverse-propensity estimates when exploration data is used to estimate FAR of AUTO decisions.

### 9A.5 Promotion rule (pre-registered)

Promote a challenger only if **all** hold:
1. FAR 95% upper bound ≤ `FAR_MAX` on both the time-split test and D1 held-out.
2. `ask_rate` improves vs champion by a statistically significant paired margin on the time-split test (McNemar p < 0.05).
3. No regression > 2 percentage points on any mandatory breakdown (region, environment, device tier, tag).
4. Latency budgets (§7.4) still hold. Parameter files are small, but L3 trees and L2 cost tables must be re-benchmarked.

### 9A.6 Staged rollout and rollback

- Remote config: shadow (compute only) → 5% of shops → 25% → 100%, at least one week per stage.
- **Online guardrail:** post-AUTO correction rate (implicit negatives / AUTO). Rollback is automatic to the previous config if it exceeds the champion's rate by > `CL_ROLLBACK_DELTA` *(start 1 percentage point)* with a 95% CI that excludes 0.

---

## 9B. P9 — Bounded agent optimization loop (optional)

**When to use.** No telemetry or not enough labeled traffic, but D1–D3 exist. The owner wants to try improving the resolver/gate without new data.

**Classification.** A **coding agent in a bounded autonomous loop** with a fixed eval harness as the verifier.
- Not continuous learning. Not model training — except iterations that refit G2, which count as training a ~10-parameter LR and are logged as such.
- Roles:
  - **Planner + executor:** the agent.
  - **Verifier:** the eval harness (§7).
  - **Guard:** the protected-path checker.
  - **Decision:** the accept/revert rule below.

### 9B.1 Contract

| Item | Specification |
|---|---|
| Budget | **10 iterations** max; wall-clock cap `AGENT_MAX_HOURS` *(start 4 h)*; stop early after 3 consecutive non-improving iterations |
| Allowed to change | `config/resolver.json`, `config/gate.json`, `phonetic_rules.vi.json`, and code under `packages/resolver/src/**` (scorers, fusion, features), behind the existing interfaces |
| **Protected (read-only)** | `eval/data/**`, `eval/splits/**`, `eval/metrics/**`, `eval/configs/selection_rule.yaml`, golden test expectations, §7.4 budgets |
| Protection mechanism | sha256 manifest of protected paths checked before every run. Any mismatch → iteration invalid, counted against budget, change reverted |
| Visible to the agent | Calibration-split metrics, per-tag breakdowns, calibration failure gallery, Node latency benchmark |
| **Hidden from the agent** | Held-out split ("lockbox"). Evaluated **once**, by the harness, after the loop ends |
| Objective | Minimize `ask_rate` subject to FAR ≤ `FAR_MAX` on calibration; tie-break by `recall@3`; reject any change that breaks a latency budget in the Node benchmark |

### 9B.2 Iteration protocol

1. **Write the hypothesis first** to `eval/agent_runs/<run_id>/iter_<k>.json`: the failure pattern seen in the calibration gallery, the proposed change, and the expected effect on which metric/tag.
2. Make the change on branch `agent/<run_id>/iter-<k>`. Unit tests and golden suite must pass.
3. Run the harness on the calibration split.
4. **Accept** only if the paired bootstrap 95% CI of the objective difference vs best-so-far excludes 0 **and** no constraint is violated. Otherwise **revert**.
5. Record metrics, diff stats, accept/revert, and cost (harness minutes, agent tokens) in the iteration file.

This is hill climbing with revert: best-so-far only moves on a measured improvement.

### 9B.3 Overfitting control

Ten adaptive tries on the same calibration data can overfit it. This is the adaptive data analysis problem; see Dwork et al., *Generalization in Adaptive Data Analysis and Holdout Reuse* (2015).

Controls:
- Lockbox evaluated exactly once.
- Final winner must pass the §8.3 rule on the lockbox **and** beat the pre-loop baseline with McNemar p < 0.05.
  - No Bonferroni factor is needed here. The 10 adaptive choices were made on calibration data. Exactly **one** config is tested on the lockbox, which the agent never saw, so the lockbox comparison is a single pre-specified test.
  - The multiple-comparison problem lives on the calibration side, and the untouched lockbox is what controls it.
  - Testing more than one config on the lockbox would require a correction (or a second lockbox).
- If the loop is ever extended beyond 10 iterations, switch the calibration feedback to a Thresholdout-style noisy reuse, or draw a fresh calibration sample.

### 9B.4 Output

- One PR containing: final diff, all iteration files, a summary table (iteration × hypothesis × Δmetric × accepted), and the lockbox report.
- **Never auto-merged.** A human reviews the diff hunk by hunk.
- Failure recovery: a harness crash or failing tests marks the iteration invalid (counts against budget) and resets to best-so-far. The run is resumable from the last iteration file.

### 9B.5 How P8 and P9 relate

- P9 can run on a P8 snapshot. Its lockbox is then the latest time-split week.
- Its output enters P8's promotion rule (§9A.5) like any other challenger.

---

## 9C. P9-QD — quality-diversity variant of P9 (conditional)

**Idea source.** QD-Rec (Sakana AI, 2026) and MAP-Elites (Mouret & Clune, 2015). Instead of a single best-so-far, keep an **archive of elites, one per niche**. A change that fixes one error family but costs a little elsewhere survives as a stepping stone instead of being reverted.

**When to use.** Only if **all** hold:
- P9 hill climbing has plateaued (≥ 2 runs without an accepted lockbox improvement).
- Calibration data has ≥ 200 lines per niche, so it can be split into fold A (agent-facing) and fold B (validation).
- The owner accepts a budget of 50–100 harness evaluations.

**Deliberate differences from QD-Rec.**

| QD-Rec | P9-QD | Why |
|---|---|---|
| Quality scored by an LLM judge, which is also what the search optimizes; no held-out evaluation | Quality = harness metrics on **labeled** data; lockbox untouched until the end | Ground truth exists here; an LLM judge would invite the reward hacking QD-Rec's authors warn about |
| Novelty decided by an LLM judge | Novelty = deterministic distance between per-niche metric vectors | Reproducible, cheap, not gameable by wording |
| Searches recommendation items + natural-language hypotheses | Searches resolver/gate configs and scorer code | Different object, same loop shape |

### 9C.1 Archive

- **Niches** = error tags: `loanword`, `dialect`, `near_duplicate`, `multi_line`, `out_of_catalog`, `clean`.
- **Entry** = config/diff + per-niche metric vector `m` (top-1, ask_rate at FAR constraint, per niche) + global metrics + latency.
- **Global constraints for any entry:**
  - FAR upper bound ≤ `FAR_MAX` on fold B
  - latency budget held
  - global ask_rate no worse than baseline by more than `QD_STEP_TOL` *(start 3 pp)* — this is the stepping-stone tolerance
- **Elite of niche c** = entry with the best niche-c objective among entries meeting the constraints.

### 9C.2 Loop (one evaluation per step)

1. **Pick a niche.** UCB bandit: `score_c = residual_errors_c × gain_rate_c + β·√(ln t / n_c)`, β *(start 0.5)*. Every evaluation updates the bandit, including rejections. This mirrors QD-Rec's rule that the bandit learns from rejected candidates too.
2. **Pick a parent.** The elite of niche c (probability 0.8), or a uniformly random archive entry (0.2).
3. **Apply one operator** (agent writes the hypothesis first, as in §9B.2):
   - **mutate:** change the parent to target niche-c failures
   - **crossover:** merge the parent with the elite of another niche (union of settings; conflicts resolved by a deterministic precedence list)
   - **explore:** an approach absent from the archive (e.g. enable retriever P, a different fusion)
4. **Evaluate** on fold A (agent-visible, §9C.4) and fold B (admission).
5. **Admission (local competition):**
   - The candidate becomes elite of niche c' if, on fold B, its niche-c' objective beats the current elite's with a paired bootstrap CI > 0 **and** constraints hold.
   - Otherwise, if its metric-vector cosine distance to every entry > ν *(start 0.3)* and constraints hold, it enters a **novelty buffer** (cap 5, FIFO).
   - Otherwise it is discarded.

**Stop rule.** `QD_MAX_EVALS` *(start 60)*, or no new elite for 15 consecutive evaluations.

### 9C.3 Final selection

1. Candidates = all niche elites plus up to 3 crossovers of the top elites evaluated during the loop.
2. Apply the §8.3 rule **on fold B** to pick **one** config.
3. Test that single config on the lockbox once: §8.3 rule + McNemar p < 0.05 vs the pre-loop baseline. Single test, so no multiplicity correction.

### 9C.4 Controlling information leakage from many evaluations

With 50–100 adaptive evaluations, fold B's numbers would leak into the agent's choices if shown raw. So the agent sees fold-A metrics through **Thresholdout** (Dwork et al. 2015):
- For each requested metric, return the fold-A value, **unless** |A − B| exceeds threshold T *(start 2 pp)* + Laplace noise. In that case return B + Laplace noise and decrement an overfitting budget `QD_THRESHOLDOUT_BUDGET` *(start 10)*.
- When the budget is exhausted, stop the loop.
- Metrics shown to the agent are rounded to 1 pp.
- Admission decisions use fold B internally. The agent only learns accept/reject and which niche.

### 9C.5 Output

- Same as §9B.4, plus an archive view: niche × elite × metric vector, and a lineage graph (parent → child, operator).
- Classification: still a **coding agent in a bounded loop** with the harness as verifier. No LLM judge. No model training except iterations refitting G2.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| STT model license CC BY-NC-ND 4.0 | Owner decision; separate track to evaluate a permissively licensed Vietnamese streaming transducer through the same harness. Not legal advice |
| D1 too small for FAR claims | Rule of three; shadow mode before enabling |
| Synthetic D2 not representative | Fit confusion frequencies to D1; never decide on D2 alone |
| Qdrant Edge beta API changes | Version pin; reference is eval-only |
| Beam search CPU cost | Budget gate in §8.3 |
| Near-duplicate products (size/flavor) | Margin + unit features; D3 families; ASK by design |
| Tone-placement / i–y inconsistencies in catalog data | Normalizer canonicalization + tests |
| P8 labels biased toward ASK cases | Exploration + implicit negatives + propensity logging (§9A.2) |
| P8 model drift / bad promotion | Time-split eval, pre-registered promotion rule, staged rollout, automatic rollback (§9A.5–9A.6) |
| P9 agent overfits calibration or edits the eval | Protected-path hash manifest, lockbox used once for a single config, human review (§9B) |
| P9-QD leaks validation information through many evaluations | Thresholdout-gated feedback with a detection budget, rounded metrics, stop rule (§9C.4) |

---

## 11. Conditions to ship Qdrant Edge natively (otherwise do not)

All of the following must hold:
- (a) Measured TS resolver violates a §7.4 budget at real catalog sizes, **or** dense on-device retrieval shows a gain that sparse methods cannot reach;
- (b) a maintained Android path exists (Rust crate via JNI/uniffi) with acceptable binary size;
- (c) Qdrant Edge is out of beta or the owner accepts beta risk.

---

## 12. Flags and config

| Key | Default | Purpose |
|---|---|---|
| `VOICE_RESOLVER_V2` | false | Use new resolver + gate |
| `VOICE_RESOLVER_SHADOW` | false | Compute and log only |
| `STT_HOTWORDS` | false | Beam search + hotwords |
| `RESOLVER_CONFIG` | `config/resolver.json` | Retriever set, fusion, K, τ parameters |
| `GATE_CONFIG` | `config/gate.json` | G1 thresholds or G2 weights |
| `ALIAS_MIN_CONFIRMATIONS` | 2 | Alias trust threshold |
| `HOTWORDS_MAX` / `HOTWORDS_SCORE` | 50 / 1.5 | Biasing |
| `CL_ENABLED` | false | P8 opt-in trace upload + remote config |
| `CL_MIN_EVENTS` | 500 / week | Threshold to run P8 instead of P9 |
| `CL_EXPLORE_RATE` | 0.03 | Share of would-be-AUTO lines routed to ASK |
| `CL_SHUFFLE_RATE` | 0.10 | Share of ASK dialogs with candidate 2–3 shuffled |
| `CL_ROLLBACK_DELTA` | 1 pp | Post-AUTO correction rate increase that triggers rollback |
| `AGENT_MAX_ITERS` / `AGENT_MAX_HOURS` | 10 / 4 | P9 budget |
| `QD_MAX_EVALS` | 60 | P9-QD budget |
| `QD_STEP_TOL` | 3 pp | Stepping-stone tolerance on global ask_rate |
| `QD_THRESHOLDOUT_BUDGET` / T | 10 / 2 pp | Thresholdout overfitting budget and threshold |

---

## 13. References

### Core algorithms
- Zobel, J., Moffat, A., Sacks-Davis, R. (1993). *Searching Large Lexicons for Partially Specified Terms using Compressed Inverted Files.* VLDB. https://www.vldb.org/conf/1993/P290.PDF
- Ukkonen, E. (1992). *Approximate string-matching with q-grams and maximal matches.* Theoretical Computer Science 92(1):191–211. Bibliographic entry: https://ftp.math.utah.edu/pub/tex/bib/idx/tcs1990/92/1/191_211.html — abstract: https://tr.informatik.uni-freiburg.de/1991/Report29/index.html
- Cox, R. (2012). *Regular Expression Matching with a Trigram Index.* https://swtch.com/~rsc/regexp/regexp4.html
- Marti, V. (2026). *Fast regex search: indexing text for agent tools.* Cursor. https://cursor.com/blog/fast-regex-search

### Fusion, gating, calibration
- Qdrant. *Hybrid and Multi-Stage Queries* (RRF, weighted RRF, DBSF; tune on train/val split). https://qdrant.tech/documentation/search/hybrid-queries/
- Qdrant. *Predicting Weak Retrieval Without an LLM.* https://qdrant.tech/articles/predicting-weak-retrieval/
- Query Performance Prediction survey (cited by Qdrant). https://arxiv.org/abs/2504.01101
- Cormack, Clarke, Büttcher (2009). *Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods.* https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
- scikit-learn: probability calibration. https://scikit-learn.org/stable/modules/calibration.html

### Qdrant Edge (reference implementation)
- Qdrant Edge overview (beta; Python and Rust bindings). https://qdrant.tech/documentation/edge/
- BM25 with Qdrant Edge (`ascii_folding`, tokenizers, `avg_len`). https://qdrant.tech/documentation/edge/edge-bm25/
- Edge API reference. https://qdrant.tech/documentation/edge/edge-api/

### STT and biasing
- sherpa-onnx hotwords (contextual biasing; transducer-only). https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html
- sherpa-onnx repository. https://github.com/k2-fsa/sherpa-onnx
- react-native-sherpa-onnx hotwords guide (verify it is the binding in use). https://www.mintlify.com/xdcobra/react-native-sherpa-onnx/guides/hotwords

### Vietnamese text and evaluation
- Unicode Normalization Forms (UAX #15). https://unicode.org/reports/tr15/
- jiwer (WER/CER). https://github.com/jitsi/jiwer
- Efron & Tibshirani, bootstrap confidence intervals — overview: https://en.wikipedia.org/wiki/Bootstrapping_(statistics)
- McNemar's test — overview: https://en.wikipedia.org/wiki/McNemar%27s_test
- Rule of three (statistics) — overview: https://en.wikipedia.org/wiki/Rule_of_three_(statistics)

### Learning from feedback (P8)
- Ristad, E. S., Yianilos, P. N. (1998). *Learning String Edit Distance.* IEEE TPAMI. https://arxiv.org/abs/cmp-lg/9610005
- Lakkaraju, H., Kleinberg, J., Leskovec, J., Ludwig, J., Mullainathan, S. (2017). *The Selective Labels Problem.* KDD. https://www.cs.cornell.edu/home/kleinber/kdd17-selective.pdf
- Joachims, T., Swaminathan, A., Schnabel, T. (2017). *Unbiased Learning-to-Rank with Biased Feedback.* WSDM. https://www.cs.cornell.edu/~schnabts/downloads/joachims2017ltr.pdf
- icefall, *LODR for RNN Transducer* (conditional L4). https://icefall.readthedocs.io/en/latest/decoding-with-langugage-models/LODR.html
- sherpa-onnx changelog (LODR for online and offline recognizers since 1.12.5). https://pub.dev/packages/sherpa_onnx_linux/changelog
- KenLM (not used; reason in §9A.1). https://kheafield.com/code/kenlm

### Adaptive evaluation (P9)
- Dwork, C., Feldman, V., Hardt, M., Pitassi, T., Reingold, O., Roth, A. (2015). *Generalization in Adaptive Data Analysis and Holdout Reuse.* https://arxiv.org/abs/1506.02629
- Google Research blog, *The reusable holdout: Preserving validity in adaptive data analysis.* https://www.research.google/blog/the-reusable-holdout-preserving-validity-in-adaptive-data-analysis/

### Quality-diversity search (P9-QD)
- Sakana AI (2026). *QD-Rec: Open-Ended Evolution of Recommendations via Quality–Diversity.* arXiv 2610.23470. https://arxiv.org/abs/2610.23470 — project page: https://pub.sakana.ai/qd-rec/ — code (Apache-2.0): https://github.com/SakanaAI/QD-Rec
- Mouret, J.-B., Clune, J. (2015). *Illuminating search spaces by mapping elites* (MAP-Elites). https://arxiv.org/abs/1504.04909

### Licensing
- CC BY-NC-ND 4.0 legal code. https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
