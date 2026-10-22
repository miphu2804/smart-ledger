"""PREREG C: offline outbox for product creation against today's Core contract.

Core facts this models (docs/contracts/api-contracts.md, verified 2026-10-22):
POST /products has no Idempotency-Key and no replay guarantee; product names are
not unique; POST /expenses requires Idempotency-Key and replays the first result.

  uv run python evaluation/voice_order/offline_outbox.py  # writes results/outbox.json
"""

import json
import os
import random
import unicodedata
from dataclasses import dataclass, field

P_LOST_BEFORE = 0.10  # request never reaches Core
P_LOST_AFTER = 0.10  # Core applied it, the response is lost
INTENTS_PER_DEVICE = 500
SHARED_NAME_SHARE = 0.05  # device-2 new products that share a name with a device-1 one
SYNC_EVERY = 20  # ticks between replica delta syncs
OFFLINE_SPANS = 4  # offline windows per device per run
OFFLINE_LEN = 40  # ticks


def norm(name: str) -> str:
    name = name.replace("đ", "d").replace("Đ", "D")
    plain = "".join(
        c for c in unicodedata.normalize("NFD", name) if unicodedata.category(c) != "Mn"
    )
    return " ".join(plain.lower().split())


class Ambiguous(Exception):
    """Timeout: the request may or may not have been applied."""


class Offline(Exception):
    """Known not sent."""


class Core:
    def __init__(self, rng: random.Random, product_keys: bool):
        self.rng, self.product_keys = rng, product_keys
        self.products: dict[int, dict] = {}
        self.expenses: list[dict] = []
        self.keys: dict[str, object] = {}
        self.next_id = 1

    def _call(self, apply):
        if self.rng.random() < P_LOST_BEFORE:
            raise Ambiguous
        result = apply()
        if self.rng.random() < P_LOST_AFTER:
            raise Ambiguous
        return result

    def create_product(self, name: str, intent: str, key: str | None, device: str = ""):
        def apply():
            if self.product_keys and key in self.keys:
                return self.keys[key]
            pid = self.next_id
            self.next_id += 1
            self.products[pid] = {"name": name, "intent": intent, "device": device}
            if self.product_keys:
                self.keys[key] = pid
            return pid

        return self._call(apply)

    def create_expense(self, amount: int, intent: str, key: str):
        def apply():
            if key not in self.keys:
                self.expenses.append({"intent": intent, "amount": amount})
                self.keys[key] = True
            return True

        return self._call(apply)

    def search_products(self, name: str) -> list[int]:
        return self._call(
            lambda: [
                pid for pid, p in self.products.items() if norm(p["name"]) == norm(name)
            ]
        )

    def ids(self) -> set[int]:
        return set(self.products)


@dataclass
class Intent:
    kind: str  # product | expense
    name: str
    intent: str  # label of what the owner meant; equal labels mean the same real item
    tries: int = 0
    done: bool = False
    product_id: int | None = None
    snapshot: set[int] = field(default_factory=set)
    ambiguous: bool = False


@dataclass
class Device:
    name: str
    queue: list[Intent]
    offline: set[int]
    replica: set[int] = field(default_factory=set)
    claimed: set[int] = field(default_factory=set)


def workload(rng: random.Random) -> tuple[list[Intent], list[Intent]]:
    devices = []
    for d in (1, 2):
        intents = []
        for i in range(INTENTS_PER_DEVICE):
            if rng.random() < 0.6:
                intents.append(Intent("product", f"Món {d}-{i}", f"item-{d}-{i}"))
            else:
                intents.append(Intent("expense", "", f"exp-{d}-{i}"))
        devices.append(intents)
    # Some device-2 products share a device-1 name, queued at about the same time.
    # Half are the same real item entered twice, half a second product with that name.
    for i, intent in enumerate(devices[1]):
        twin = devices[0][i]
        if (
            intent.kind == "product"
            and twin.kind == "product"
            and rng.random() < SHARED_NAME_SHARE / 0.6
        ):
            intent.name = twin.name.upper()  # different spelling, same normalized name
            intent.intent = (
                twin.intent if rng.random() < 0.5 else f"{twin.intent}-other"
            )
    return devices[0], devices[1]


def run(seed: int, strategy: str) -> dict:
    rng = random.Random(seed)
    core = Core(random.Random(seed * 7), product_keys=(strategy == "S3"))
    w1, w2 = workload(rng)
    devices = []
    for name, intents in (("d1", w1), ("d2", w2)):
        offline = set()
        for _ in range(OFFLINE_SPANS):
            start = rng.randrange(0, INTENTS_PER_DEVICE * 2)
            offline |= set(range(start, start + OFFLINE_LEN))
        devices.append(Device(name, list(intents), offline))
    lost = 0

    def attempt(dev: Device, it: Intent, tick: int) -> None:
        if tick in dev.offline:
            raise Offline
        it.tries += 1
        if it.kind == "expense":
            core.create_expense(
                1000, it.intent, key=f"{it.intent}"
            )  # key kept across retries
        else:
            if strategy == "S2" and it.ambiguous:
                found = [
                    pid
                    for pid in core.search_products(it.name)
                    if pid not in it.snapshot and pid not in dev.claimed
                ]
                if found:
                    it.product_id = min(found)
                    dev.claimed.add(it.product_id)
                    it.done = True
                    return
            it.product_id = core.create_product(
                it.name, it.intent, key=f"{dev.name}:{it.intent}", device=dev.name
            )
            dev.claimed.add(it.product_id)
        it.done = True

    # S0: each intent is tried when entered, and once more by hand on failure.
    if strategy == "S0":
        for tick in range(INTENTS_PER_DEVICE):
            for dev in devices:
                it = dev.queue[tick]
                for retry_tick in (tick * 2, tick * 2 + 1):
                    try:
                        attempt(dev, it, retry_tick)
                        break
                    except (Offline, Ambiguous):
                        continue
                if not it.done:
                    lost += 1
    else:
        # Outbox: intents enter the queue in order; the queue drains in order and
        # keeps retrying through offline windows until each one lands.
        tick = 0
        pending = {dev.name: [] for dev in devices}
        while tick < 20 * INTENTS_PER_DEVICE and (
            tick < INTENTS_PER_DEVICE or any(pending.values())
        ):
            for dev in devices:
                if tick % SYNC_EVERY == 0 and tick not in dev.offline:
                    dev.replica = core.ids()
                if tick < INTENTS_PER_DEVICE:
                    it = dev.queue[tick]
                    it.snapshot = set(dev.replica) | dev.claimed
                    pending[dev.name].append(it)
                if pending[dev.name]:
                    head = pending[dev.name][0]
                    try:
                        attempt(dev, head, tick)
                        pending[dev.name].pop(0)
                    except Offline:
                        pass
                    except Ambiguous:
                        head.ambiguous = True
            tick += 1
        lost = sum(len(p) for p in pending.values())

    # Score against what the owners meant.
    per_entry: dict[tuple[str, str], int] = {}
    for p in core.products.values():
        per_entry[(p["device"], p["intent"])] = (
            per_entry.get((p["device"], p["intent"]), 0) + 1
        )
    intents = [
        (dev.name, it) for dev in devices for it in dev.queue if it.kind == "product"
    ]
    adopted = [
        (d, it)
        for d, it in intents
        if it.done
        and (
            core.products[it.product_id]["device"],
            core.products[it.product_id]["intent"],
        )
        != (d, it.intent)
    ]
    # A product whose own create landed but whose intent then adopted another
    # product is an extra copy too; retry duplicates already count the rest.
    adopted_from = {(d, it.intent) for d, it in adopted}
    orphaned = sum(
        1
        for p in core.products.values()
        if (p["device"], p["intent"]) in adopted_from
        and per_entry[(p["device"], p["intent"])] == 1
    )
    return {
        "retry_duplicates": sum(n - 1 for n in per_entry.values() if n > 1),
        "orphaned_by_adoption": orphaned,
        "lost_intents": lost,
        "false_merges": sum(
            1
            for _, it in adopted
            if core.products[it.product_id]["intent"] != it.intent
        ),
        "same_item_merged": sum(
            1
            for _, it in adopted
            if core.products[it.product_id]["intent"] == it.intent
        ),
        "expenses_doubled": len(core.expenses)
        - len({e["intent"] for e in core.expenses}),
        "product_intents": len(intents),
    }


def main() -> None:
    results = {}
    for strategy in ("S0", "S1", "S2", "S3"):
        rows = [run(seed, strategy) for seed in range(1, 11)]
        results[strategy] = {k: sum(r[k] for r in rows) for k in rows[0]}
    print(f"{'':4}" + "".join(f"{k:>18}" for k in results["S0"]))
    for s, r in results.items():
        print(f"{s:4}" + "".join(f"{v:>18}" for v in r.values()))
    out = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "results", "outbox.json"
    )
    json.dump(results, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
