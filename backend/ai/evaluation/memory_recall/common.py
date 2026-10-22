"""Shared setup: shops per split, the shared-corpus prior, and an evaluator."""

from data import build
from systems import Lexical, metrics, run_shop

SPLITS = {
    # seeds and lexicon half; sizes cover a new owner (15) to a heavy one (120)
    "dev": dict(seeds=range(1, 9), half="A"),
    "test": dict(seeds=range(1001, 1009), half="B"),
}
SIZES = (15, 40, 120)
# a store a month old (today's production) and one half a year old
AGES = (30.0, 180.0)


def shops(split):
    s = SPLITS[split]
    return [
        build(seed, s["half"], size, max_age=age)
        for seed in s["seeds"]
        for size in SIZES
        for age in AGES
    ]


def prior_of(shop_list):
    lex = Lexical([m for sh in shop_list for m in sh.memories])
    return lex.df, lex.n


def evaluate(cfg, shop_list, dense, prior, by_size=False):
    recs = []
    per = {}
    for sh in shop_list:
        r = run_shop(cfg, sh, dense, prior)
        recs += r
        per.setdefault(len([m for m in sh.memories if m.older is None]), []).extend(r)
    out = metrics(recs)
    if by_size:
        out["by_size"] = {k: metrics(v) for k, v in sorted(per.items())}
    return out, recs
