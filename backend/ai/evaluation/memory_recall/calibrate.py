"""Check SimDense against ADR-0002: cosine-only top-1 0.92-0.95 on 34-40 facts."""

from data import build
from systems import COSINE, SimDense, metrics, run_shop

recs = []
for seed in range(1, 9):
    recs += run_shop(COSINE, build(seed, "A", 36), SimDense(), None)
m = metrics(recs)
lex = [(q, g) for q, g in recs if q.form == "lex"]
print(
    "lex top1",
    sum(g and g[0] == q.gold for q, g in lex) / len(lex),
    "lex R@5",
    m["R@5_lex"],
    "all",
    {k: round(v, 3) for k, v in m.items()},
)
