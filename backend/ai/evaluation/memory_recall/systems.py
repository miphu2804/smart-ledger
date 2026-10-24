"""Recall configs for the agent-memory benchmark and the loop that scores them.

A config is: which channels find candidates (dense cosine, lexical BM25, both), how
they fuse, how age / importance / use count weigh the result, and an optional
relevance floor below which nothing is injected. The current main branch is
`BASELINE`: cosine top 20, re-ranked by relevance * importance * exp(-0.01 * days
since last use) * (1 + ln(max(use_count, 1))), top 5, every returned memory has its
use recorded (backend/ai/src/memory/repository.py, `search` and `_searched`).
"""

import hashlib
import math
import random
import re
from collections import Counter
from dataclasses import dataclass, replace

from data import Memory, Query, Shop, strip_accents

CANDIDATES = 20
LIMIT = 5


# --- dense channel ---------------------------------------------------------------


class SimDense:
    """Cosine scores drawn per (query, memory) pair from class-conditional normals.

    Not a model. The classes come from the generator's ground truth (the target fact,
    a fact sharing its product or person, a fact of the same relation, the rest), and
    the means are set from ADR-0002's measurements with embeddinggemma-300m on
    staging: same-subject pairs 0.66-0.95, unrelated 0.53-0.67. `calibrate.py` checks
    that cosine-only top-1 lands near the ADR's 0.92-0.95 on a 34-40 fact store.
    Used only to study the ranking layer; replace with `STDense` for real numbers.
    """

    def __init__(
        self,
        gold=(0.83, 0.06),
        unacc=(0.72, 0.08),
        sem=(0.74, 0.07),
        strong=(0.69, 0.05),
        weak=(0.64, 0.04),
        other=(0.58, 0.035),
        seed=0,
    ):
        self.params = dict(
            gold=gold, unacc=unacc, sem=sem, strong=strong, weak=weak, other=other
        )
        self.seed = seed
        self._cache = {}

    def _draw(self, key: str, mean_sd) -> float:
        hit = self._cache.get((key, mean_sd))
        if hit is not None:
            return hit
        h = int.from_bytes(
            hashlib.blake2b(f"{self.seed}|{key}".encode(), digest_size=8).digest(),
            "big",
        )
        r = random.Random(h)
        v = self._cache[(key, mean_sd)] = max(-1.0, min(1.0, r.gauss(*mean_sd)))
        return v

    def scores(self, query: Query, memories: list[Memory], by_id: dict[int, Memory]):
        target = by_id.get(query.gold) if query.gold is not None else None
        out = {}
        for m in memories:
            key = f"{query.text}|{m.id}|{m.content}"
            if target is not None and (m.id == query.gold or m.id == query.stale):
                cls = {"lex": "gold", "unacc": "unacc", "sem": "sem"}[query.form]
                s = self._draw(key, self.params[cls]) - (
                    0.02 if m.id == query.stale else 0
                )
            elif target is not None and (
                (m.product and m.product == target.product)
                or (m.person and m.person == target.person)
            ):
                s = self._draw(key, self.params["strong"])
            elif target is not None and m.relation == target.relation:
                s = self._draw(key, self.params["weak"])
            else:
                s = self._draw(key, self.params["other"])
            out[m.id] = s
        return out


class STDense:
    """Real cosine from a sentence-transformers model, e.g. embeddinggemma-300m."""

    def __init__(self, name: str, dims: int | None = 384):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(name, truncate_dim=dims)
        self.cache: dict[tuple[str, str], list[float]] = {}

    def _embed(self, texts: list[str], kind: str):
        missing = [t for t in dict.fromkeys(texts) if (kind, t) not in self.cache]
        if missing:
            enc = self.model.encode_query if kind == "q" else self.model.encode_document
            for t, v in zip(missing, enc(missing, normalize_embeddings=True)):
                self.cache[(kind, t)] = v
        return [self.cache[(kind, t)] for t in texts]

    def scores(self, query: Query, memories: list[Memory], by_id):
        q = self._embed([query.text], "q")[0]
        docs = self._embed([m.content for m in memories], "d")
        return {m.id: float(q @ d) for m, d in zip(memories, docs)}


# --- lexical channel -------------------------------------------------------------

TOKEN = re.compile(r"\w+")


def tokens(text: str) -> list[str]:
    """Lowercased syllables without diacritics, so "gao" finds "gạo"."""
    return TOKEN.findall(strip_accents(text).lower())


class Lexical:
    """BM25 over syllables and syllable bigrams of the owner's memories.

    `prior` is document frequencies from a shared corpus (all shops' memories), blended
    in with weight `prior_weight` documents: an owner with 15 memories has an IDF too
    noisy to tell "giao" from "Tùng" (the Cursor regex-search note on borrowing IDF from
    a shared corpus).
    """

    def __init__(
        self,
        memories: list[Memory],
        k1=1.2,
        b=0.75,
        bigrams=True,
        prior: tuple[Counter, int] | None = None,
        prior_weight=0.0,
    ):
        self.k1, self.b, self.bigrams = k1, b, bigrams
        self.docs = {m.id: self._terms(m.content) for m in memories}
        self.avg = sum(len(t) for t in self.docs.values()) / max(len(self.docs), 1)
        self.df = Counter(t for terms in self.docs.values() for t in set(terms))
        self.n = len(self.docs)
        self.prior, self.prior_weight = prior, prior_weight
        self._memo = {}

    def _terms(self, text: str) -> list[str]:
        toks = tokens(text)
        return toks + (
            [f"{a}_{b}" for a, b in zip(toks, toks[1:])] if self.bigrams else []
        )

    def idf(self, term: str) -> float:
        local = math.log(1 + (self.n - self.df[term] + 0.5) / (self.df[term] + 0.5))
        if not self.prior or not self.prior_weight:
            return local
        pdf, pn = self.prior
        shared = math.log(1 + (pn - pdf[term] + 0.5) / (pdf[term] + 0.5))
        w = self.prior_weight / (self.prior_weight + self.n)
        return (1 - w) * local + w * shared

    def scores(self, text: str) -> tuple[dict[int, float], dict[int, float]]:
        """BM25 per memory, and the share of the query's IDF mass each one matches."""
        hit = self._memo.get(text)
        if hit is None:
            hit = self._memo[text] = self._scores(text)
        return hit

    def _scores(self, text: str):
        q = list(dict.fromkeys(self._terms(text)))
        idf = {t: self.idf(t) for t in q}
        total = sum(idf.values()) or 1.0
        out, cover = {}, {}
        for mid, terms in self.docs.items():
            tf = Counter(terms)
            s = c = 0.0
            for t in q:
                if tf[t]:
                    norm = (
                        tf[t]
                        * (self.k1 + 1)
                        / (
                            tf[t]
                            + self.k1 * (1 - self.b + self.b * len(terms) / self.avg)
                        )
                    )
                    s += idf[t] * norm
                    c += idf[t]
            if s > 0:
                out[mid] = s
                cover[mid] = c / total
        return out, cover


# --- configs ---------------------------------------------------------------------


@dataclass(frozen=True)
class Config:
    name: str = "baseline"
    channels: str = "dense"  # dense | hybrid | lexical
    fusion: str = "none"  # none | rrf | mix
    rrf_k: int = 60
    mix_alpha: float = 0.0  # weight of normalised BM25 added to cosine
    weight: str = "mult"  # mult | add | none
    decay: float = 0.01  # per day
    decay_from: str = "last_used"  # last_used | created
    use_importance: bool = True
    freq: str = "ln"  # ln | none
    add_w: tuple = (0.0, 0.0, 0.0)  # (recency, importance, frequency) in "add"
    floor: float | None = None  # min cosine to inject (dense / hybrid)
    lex_cover: float = 0.6  # a lexical match counts past the floor at this IDF share
    prior_weight: float = 0.0

    def parts(self) -> int:
        """How many departures from plain cosine top-5 the config carries."""
        return sum(
            [
                self.channels != "dense",
                self.weight != "none",
                self.weight == "mult" and self.use_importance,
                self.weight == "mult" and self.freq != "none",
                self.floor is not None,
                self.prior_weight > 0,
            ]
        )


BASELINE = Config()
COSINE = Config(name="cosine", weight="none", freq="none", use_importance=False)


def rank(
    cfg: Config,
    query: Query,
    pool: list[Memory],
    by_id,
    dense,
    lexical: Lexical | None,
    now: float,
) -> list[int]:
    """Ids the config injects for `query`, best first, at most LIMIT."""
    if not pool:
        return []
    cos = dense.scores(query, pool, by_id) if cfg.channels != "lexical" else {}
    bm, cover = (
        lexical.scores(query.text) if lexical and cfg.channels != "dense" else ({}, {})
    )
    cands: dict[int, float] = {}
    if cfg.channels in ("dense", "hybrid"):
        for mid in sorted(cos, key=cos.get, reverse=True)[:CANDIDATES]:
            cands[mid] = 0.0
    if cfg.channels in ("lexical", "hybrid"):
        for mid in sorted(bm, key=bm.get, reverse=True)[:CANDIDATES]:
            cands[mid] = 0.0
    # Relevance per candidate.
    if cfg.channels == "dense":
        rel = {m: cos[m] for m in cands}
    elif cfg.channels == "lexical":
        top = max(bm.values()) if bm else 1.0
        rel = {m: bm.get(m, 0) / top for m in cands}
    elif cfg.fusion == "rrf":
        dr = {m: i for i, m in enumerate(sorted(cos, key=cos.get, reverse=True))}
        lr = {m: i for i, m in enumerate(sorted(bm, key=bm.get, reverse=True))}
        rel = {
            m: 1 / (cfg.rrf_k + dr[m] + 1)
            + (1 / (cfg.rrf_k + lr[m] + 1) if m in lr else 0)
            for m in cands
        }
        # Scale so a top-1-in-both item is about 1, like a cosine.
        scale = 2 / (cfg.rrf_k + 1)
        rel = {m: v / scale for m, v in rel.items()}
    else:  # mix
        top = max(bm.values()) if bm else 1.0
        rel = {m: cos[m] + cfg.mix_alpha * bm.get(m, 0) / top for m in cands}
    # Floor: inject only what is close enough by cosine, or clearly matched by words.
    if cfg.floor is not None:
        keep = {
            m
            for m in cands
            if (cos.get(m, -1) >= cfg.floor) or (cover.get(m, 0) >= cfg.lex_cover)
        }
        rel = {m: v for m, v in rel.items() if m in keep}
    if not rel:
        return []

    def age(m: Memory) -> float:
        ref = (
            m.last_used_day
            if (cfg.decay_from == "last_used" and m.last_used_day is not None)
            else m.created_day
        )
        return max(now - ref, 0.0)

    if cfg.weight == "none":
        score = rel
    elif cfg.weight == "mult":
        score = {}
        for mid, r in rel.items():
            m = by_id[mid]
            w = math.exp(-cfg.decay * age(m))
            if cfg.use_importance:
                w *= m.importance
            if cfg.freq == "ln":
                w *= 1 + math.log(max(m.use_count, 1))
            score[mid] = r * w
    else:  # additive, Generative Agents style: min-max each part over the candidates

        def mm(d):
            lo, hi = min(d.values()), max(d.values())
            return {k: (v - lo) / (hi - lo) if hi > lo else 1.0 for k, v in d.items()}

        wr, wi, wf = cfg.add_w
        r_ = mm(rel)
        t_ = mm({m: math.exp(-cfg.decay * age(by_id[m])) for m in rel})
        i_ = mm({m: by_id[m].importance for m in rel})
        f_ = mm({m: math.log(1 + by_id[m].use_count) for m in rel})
        score = {m: r_[m] + wr * t_[m] + wi * i_[m] + wf * f_[m] for m in rel}
    return sorted(score, key=lambda m: (-score[m], m))[:LIMIT]


def run_shop(cfg: Config, shop: Shop, dense, prior, history_days=30.0):
    """Replay the shop's past traffic with `cfg` (use counts are the config's own),
    then score its queries. Returns per-query records."""
    memories = [replace(m) for m in shop.memories]
    by_id = {m.id: m for m in memories}
    lexicons: dict[int, Lexical] = {}
    n = len(shop.history)

    def step(query: Query, now: float, record: bool):
        pool = [m for m in memories if m.created_day <= now]
        lex = None
        if cfg.channels != "dense":
            lex = lexicons.get(len(pool))
            if lex is None:
                lex = lexicons[len(pool)] = Lexical(
                    pool, prior=prior, prior_weight=cfg.prior_weight
                )
        got = rank(cfg, query, pool, by_id, dense, lex, now)
        for mid in got:
            by_id[mid].use_count += 1
            by_id[mid].last_used_day = now
        return got

    for i, q in enumerate(shop.history):
        step(q, -history_days + history_days * i / max(n, 1), False)
    records = []
    for q in shop.queries:
        got = step(q, 0.0, True)
        records.append((q, got))
    return records


def metrics(records) -> dict:
    mem = [(q, g) for q, g in records if q.gold is not None]
    none = [(q, g) for q, g in records if q.gold is None]
    hit = [q.gold in g for q, g in mem]
    out = {"R@5": sum(hit) / len(hit), "n": len(mem)}
    for form in ("lex", "unacc", "sem"):
        sub = [q.gold in g for q, g in mem if q.form == form]
        out[f"R@5_{form}"] = sum(sub) / len(sub) if sub else float("nan")
    first = [bool(g) and g[0] == q.gold for q, g in mem]
    out["top1"] = sum(first) / len(first)
    stale = [(q, g) for q, g in mem if q.stale is not None]
    out["stale_only"] = (
        (sum(q.stale in g and q.gold not in g for q, g in stale) / len(stale))
        if stale
        else 0.0
    )
    out["n_stale"] = len(stale)
    out["noise"] = sum(len(g) for _, g in none) / len(none) if none else 0.0
    out["injected"] = sum(len(g) for _, g in records) / len(records)
    return out
