"""Real cosines from Cloudflare Workers AI, the repo's `cloudflare` memory provider.

Same model, prompts and 384-dim cut as backend/ai/src/memory/workers_ai_embedding.py.
Reads CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN from the environment or from the
.env named by SMARTLEDGER_AI_ENV (default backend/ai/.env). Every
text of both splits is embedded once into cache/<model>.json, so the worker
processes and later runs make no API calls.
"""

import json
import math
import os
import urllib.request

from common import SPLITS, shops
from systems import STDense

MODEL = os.environ.get("CF_EMBED_MODEL", "@cf/google/embeddinggemma-300m")
DIMS = 384
PROMPTS = {"q": "task: search result | query: ", "d": "title: none | text: "}
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", MODEL.replace("/", "_").replace("@", "") + ".json")


def _env():
    path = os.environ.get("SMARTLEDGER_AI_ENV", os.path.join(HERE, "../../.env"))
    values = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                values[k] = v.strip().strip('"').strip("'")
    acc = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or values.get("CLOUDFLARE_ACCOUNT_ID")
    tok = os.environ.get("CLOUDFLARE_API_TOKEN") or values.get("CLOUDFLARE_API_TOKEN")
    if not acc or not tok:
        raise SystemExit("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not found")
    return acc, tok


def _call(texts, acc, tok):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/v1/embeddings",
        data=json.dumps({"model": MODEL, "input": texts}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        body = json.load(r)
    return [d["embedding"] for d in sorted(body["data"], key=lambda d: d["index"])]


def _unit(v):
    v = v[:DIMS]
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def warm():
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    want = set()
    for split in SPLITS:
        for sh in shops(split):
            want |= {"d|" + m.content for m in sh.memories}
            want |= {"q|" + q.text for q in sh.queries + sh.history}
    todo = sorted(want - cache.keys())
    if todo:
        acc, tok = _env()
        for i in range(0, len(todo), 50):
            batch = todo[i : i + 50]
            vecs = _call([PROMPTS[k[0]] + k[2:] for k in batch], acc, tok)
            for k, v in zip(batch, vecs):
                cache[k] = _unit(v)
            print(f"embedded {min(i + 50, len(todo))}/{len(todo)}", flush=True)
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(cache, open(CACHE, "w"))
    return cache


class CloudflareDense(STDense):
    def __init__(self):
        self.vec = warm()
        self.memo = {}

    def _cos(self, q, d):
        hit = self.memo.get((q, d))
        if hit is None:
            a, b = self.vec["q|" + q], self.vec["d|" + d]
            hit = self.memo[(q, d)] = sum(x * y for x, y in zip(a, b))
        return hit

    def scores(self, query, memories, by_id):
        return {m.id: self._cos(query.text, m.content) for m in memories}
