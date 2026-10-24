"""Grid then coordinate ascent over recall configs, chosen by PREREG.md's rule.

    python autoresearch.py --dense sim            # cloud run, simulated cosines
    python autoresearch.py --dense cloudflare     # real embeddinggemma via Workers AI
    python autoresearch.py --dense sim --test     # the one test read, after dev

Dev results go to results/<dense>_dev.json; --test reads the stored winner from it.
"""

import argparse
import itertools
import json
import os
import random
import sys
from dataclasses import asdict, replace
from multiprocessing import Pool

from common import evaluate, prior_of, shops
from systems import BASELINE, COSINE, Config, SimDense

HERE = os.path.dirname(os.path.abspath(__file__))
G = {}


def make_dense(kind):
    if kind == "sim":
        return SimDense()
    if kind == "cloudflare":
        from cloudflare_dense import CloudflareDense

        return CloudflareDense()
    if kind.startswith("st:"):
        from systems import STDense

        return STDense(kind[3:])
    raise SystemExit(f"unknown dense {kind}")


def init(split, kind):
    G["shops"] = shops(split)
    G["prior"] = prior_of(G["shops"])
    G["dense"] = make_dense(kind)


def score(cfg):
    m, _ = evaluate(cfg, G["shops"], G["dense"], G["prior"])
    return cfg, m


def grid():
    chans = [dict(channels="dense"), dict(channels="lexical")]
    chans += [dict(channels="hybrid", fusion="rrf", rrf_k=k) for k in (10, 30, 60)]
    chans += [
        dict(channels="hybrid", fusion="mix", mix_alpha=a) for a in (0.1, 0.2, 0.3, 0.5)
    ]
    weights = [dict(weight="none", freq="none", use_importance=False)]
    for lam, frm, imp, fr in itertools.product(
        (0.01, 0.003), ("last_used", "created"), (True, False), ("ln", "none")
    ):
        weights.append(
            dict(weight="mult", decay=lam, decay_from=frm, use_importance=imp, freq=fr)
        )
    for wr, wi, wf in itertools.product((0.1, 0.3), (0.0, 0.1, 0.3), (0.0, 0.1)):
        weights.append(
            dict(weight="add", add_w=(wr, wi, wf), freq="none", use_importance=False)
        )
    floors = (None, 0.64, 0.66)
    for c, w, f in itertools.product(chans, weights, floors):
        yield Config(name="grid", **c, **w, floor=f)


def neighbours(cfg):
    for f in (None, 0.60, 0.62, 0.63, 0.64, 0.65, 0.66, 0.67, 0.68, 0.70):
        yield replace(cfg, floor=f)
    if cfg.floor is not None:
        for lc in (0.4, 0.5, 0.6, 0.7, 0.8, 1.01):
            yield replace(cfg, lex_cover=lc)
    if cfg.channels != "dense":
        for pw in (0.0, 5.0, 20.0, 80.0):
            yield replace(cfg, prior_weight=pw)
    if cfg.fusion == "mix":
        for a in (0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7):
            yield replace(cfg, mix_alpha=a)
    if cfg.fusion == "rrf":
        for k in (5, 10, 20, 30, 60, 100):
            yield replace(cfg, rrf_k=k)
    if cfg.weight != "none":
        for lam in (0.001, 0.003, 0.005, 0.01, 0.02):
            yield replace(cfg, decay=lam)


def feasible(m, cos):
    return m["noise"] <= 2.0 and m["stale_only"] <= cos["stale_only"] + 0.02


def choose(results, cos):
    ok = [(c, m) for c, m in results if feasible(m, cos)]
    if not ok:
        return None
    best = max(m["R@5"] for _, m in ok)
    near = [(c, m) for c, m in ok if m["R@5"] >= best - 0.005]
    return min(near, key=lambda cm: (cm[0].parts(), -cm[1]["top1"]))


def key(cfg):
    return json.dumps(asdict(replace(cfg, name="")), sort_keys=True)


def dev(kind, procs):
    with Pool(procs, initializer=init, initargs=("dev", kind)) as pool:
        seen = {}

        def run(cfgs):
            todo = [c for c in dict.fromkeys(cfgs) if key(c) not in seen]
            for c, m in pool.imap_unordered(score, todo, chunksize=4):
                seen[key(c)] = (c, m)
            return [seen[key(c)] for c in cfgs]

        cos = run([COSINE])[0][1]
        base = run([BASELINE])[0][1]
        run(list(grid()))
        print(f"grid: {len(seen)} configs", file=sys.stderr)
        winner = choose(list(seen.values()), cos)
        for _ in range(6):
            run(list(neighbours(winner[0])))
            nxt = choose(list(seen.values()), cos)
            if key(nxt[0]) == key(winner[0]):
                break
            winner = nxt
        nofloor = max(
            (
                (c, m)
                for c, m in seen.values()
                if c.floor is None and m["stale_only"] <= cos["stale_only"] + 0.02
            ),
            key=lambda cm: (cm[1]["R@5"], -cm[0].parts()),
        )
    out = {
        "dense": kind,
        "configs": len(seen),
        "baseline": base,
        "cosine": cos,
        "winner": {"config": asdict(winner[0]), "dev": winner[1]},
        "best_no_floor": {"config": asdict(nofloor[0]), "dev": nofloor[1]},
        "top": [
            {"config": asdict(c), "dev": m}
            for c, m in sorted(
                (cm for cm in seen.values() if feasible(cm[1], cos)),
                key=lambda cm: -cm[1]["R@5"],
            )[:15]
        ],
    }
    return out


def bootstrap(a, b, n=2000, seed=7):
    rng = random.Random(seed)
    d = [x - y for x, y in zip(a, b)]
    means = sorted(sum(rng.choice(d) for _ in d) / len(d) for _ in range(n))
    return sum(d) / len(d), means[int(0.025 * n)], means[int(0.975 * n)]


def test(kind, devres):
    init("test", kind)
    cfgs = {
        "winner": Config(
            **{
                **devres["winner"]["config"],
                "add_w": tuple(devres["winner"]["config"]["add_w"]),
            }
        ),
        "best_no_floor": Config(
            **{
                **devres["best_no_floor"]["config"],
                "add_w": tuple(devres["best_no_floor"]["config"]["add_w"]),
            }
        ),
        "baseline": BASELINE,
        "cosine": COSINE,
    }
    res, hits = {}, {}
    for name, cfg in cfgs.items():
        m, recs = evaluate(cfg, G["shops"], G["dense"], G["prior"], by_size=True)
        res[name] = m
        hits[name] = [float(q.gold in g) for q, g in recs if q.gold is not None]
    res["ci_winner_minus_baseline"] = bootstrap(hits["winner"], hits["baseline"])
    res["ci_winner_minus_cosine"] = bootstrap(hits["winner"], hits["cosine"])
    res["ci_nofloor_minus_cosine"] = bootstrap(hits["best_no_floor"], hits["cosine"])
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dense", default="sim")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--procs", type=int, default=os.cpu_count())
    a = ap.parse_args()
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    tag = a.dense.replace(":", "_").replace("/", "_")
    path = os.path.join(HERE, "results", f"{tag}_dev.json")
    if a.test:
        devres = json.load(open(path))
        out = test(a.dense, devres)
        json.dump(
            out,
            open(os.path.join(HERE, "results", f"{tag}_test.json"), "w"),
            indent=1,
            default=str,
        )
    else:
        out = dev(a.dense, a.procs)
        json.dump(out, open(path, "w"), indent=1, default=str)
    print(json.dumps(out, indent=1, default=str)[:4000])
