# /// script
# requires-python = ">=3.11"
# dependencies = ["python-crfsuite==0.9.11"]
# ///
"""Train CRF gắn nhãn BIO (QTY UNIT ITEM AMT EXP O) cho bộ parse giọng nói.

Đặc trưng do TS tính sẵn (`npm run voice:synth` → `.data/`); file này chỉ train,
gắn nhãn và xuất trọng số:

    uv run scripts/voice-crf/train.py
    uv run scripts/voice-crf/train.py --data <thư mục synth> --model <file.json> --c1 0.1  # biến thể cho voice:grid

Ghi ra:
- `src/lib/voiceParse/crf-model.json`: nhãn, ma trận chuyển, trọng số trạng thái
  (cho decoder Viterbi TS);
- `.data/eval.pred.jsonl`, `.data/dev.pred.jsonl`: nhãn CRFsuite gán và xác suất
  biên của nhãn đó, để `parity.mts` so với Viterbi và forward-backward TS.
"""

import argparse
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path

import pycrfsuite

HERE = Path(__file__).resolve().parent
DATA = HERE / ".data"
MODEL_JSON = HERE.parent.parent / "src" / "lib" / "voiceParse" / "crf-model.json"
PARAMS = {
    "c1": 0.05,
    "c2": 0.01,
    "max_iterations": 300,
    "feature.possible_transitions": True,
}


def read(data, name):
    with open(data / name, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def spans(labels):
    out, cur = set(), None
    for i, lab in enumerate(labels + ["O"]):
        if cur and not (lab.startswith("I-") and lab[2:] == cur[0]):
            out.add((cur[0], cur[1], i))
            cur = None
        if lab.startswith("B-") or (lab.startswith("I-") and cur is None):
            cur = (lab[2:], i)
    return out


def report(gold, pred):
    tp, fp, fn = Counter(), Counter(), Counter()
    tokens = correct = 0
    for g, p in zip(gold, pred):
        tokens += len(g)
        correct += sum(a == b for a, b in zip(g, p))
        sg, sp = spans(g), spans(p)
        for s in sp & sg:
            tp[s[0]] += 1
        for s in sp - sg:
            fp[s[0]] += 1
        for s in sg - sp:
            fn[s[0]] += 1
    print(f"  token accuracy {correct / tokens:.4f}")
    for k in sorted(set(tp) | set(fp) | set(fn)):
        prec = tp[k] / (tp[k] + fp[k]) if tp[k] + fp[k] else 0
        rec = tp[k] / (tp[k] + fn[k]) if tp[k] + fn[k] else 0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
        print(f"  {k:5s} P {prec:.3f} R {rec:.3f} F1 {f1:.3f} (n={tp[k] + fn[k]})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--data",
        type=Path,
        default=DATA,
        help="thư mục của voice:synth (mặc định .data/)",
    )
    ap.add_argument(
        "--model", type=Path, default=MODEL_JSON, help="file model JSON ghi ra"
    )
    ap.add_argument("--c1", type=float, default=PARAMS["c1"])
    ap.add_argument("--c2", type=float, default=PARAMS["c2"])
    ap.add_argument("--iters", type=int, default=PARAMS["max_iterations"])
    args = ap.parse_args()
    data = args.data
    params = {**PARAMS, "c1": args.c1, "c2": args.c2, "max_iterations": args.iters}
    meta = (
        json.loads((data / "meta.json").read_text())
        if (data / "meta.json").exists()
        else {}
    )
    features = meta.get("features", "v1")

    train, dev, evals = (
        read(data, "train.jsonl"),
        read(data, "dev.jsonl"),
        read(data, "eval.jsonl"),
    )
    trainer = pycrfsuite.Trainer(verbose=False)
    for row in train:
        trainer.append(row["x"], row["y"])
    trainer.set_params(params)
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "model.crfsuite")
        trainer.train(path)
        tagger = pycrfsuite.Tagger()
        tagger.open(path)

        dev_pred = [tagger.tag(row["x"]) for row in dev]
        print(
            f"train {len(train)} câu, dev synthetic {len(dev)} câu, params {params}, đặc trưng {features}"
        )
        report([row["y"] for row in dev], dev_pred)
        if (data / "lexout.jsonl").exists():
            # câu dùng từ vựng không có trong train (voice:synth --holdout 1)
            lexout = read(data, "lexout.jsonl")
            pred = [tagger.tag(row["x"]) for row in lexout]
            exact = sum(p == row["y"] for p, row in zip(pred, lexout)) / len(lexout)
            print(f"lexout {len(lexout)} câu: đúng cả câu {exact:.4f}")
            report([row["y"] for row in lexout], pred)

        info = tagger.info()
        labels = tagger.labels()
        index = {lab: i for i, lab in enumerate(labels)}
        transitions = [[0.0] * len(labels) for _ in labels]
        for (src, dst), w in info.transitions.items():
            transitions[index[src]][index[dst]] = w
        state = {}
        for (attr, lab), w in info.state_features.items():
            state.setdefault(attr, []).append([index[lab], w])
        model = {"labels": labels, "transitions": transitions, "state": state}
        if features != "v1":
            model["features"] = features
        args.model.write_text(
            json.dumps(model, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        size = args.model.stat().st_size // 1024
        print(
            f"model: {len(labels)} nhãn, {len(info.state_features)} trọng số,"
            f" {len(state)} đặc trưng → {args.model} ({size} KB)"
        )

        for name, rows in (("dev.pred.jsonl", dev), ("eval.pred.jsonl", evals)):
            with open(data / name, "w", encoding="utf-8") as f:
                for i, row in enumerate(rows):
                    pred = tagger.tag(row["x"])
                    # xác suất biên của nhãn đã chọn, để so với forward-backward TS
                    marg = [tagger.marginal(y, t) for t, y in enumerate(pred)]
                    out = {"id": row.get("id", i), "y": pred, "m": marg}
                    f.write(json.dumps(out, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
