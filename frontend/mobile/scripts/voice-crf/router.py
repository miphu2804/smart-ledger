# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["numpy<2", "scikit-learn==1.5.2"]
# ///
"""Nghiên cứu "System 1" router: học P(đơn hàng local đúng) và so với ngưỡng độ tin cậy.

Đặc trưng do `voice:router` (router.mts) xuất. Router được học trên file train, chọn
ngưỡng sao cho rủi ro (câu tự nhận mà sai / câu tự nhận) trên train không quá mục tiêu,
rồi áp ngưỡng đó cho từng tập trong các file eval:

    uv run scripts/voice-crf/router.py <train.jsonl> <eval.jsonl> [<eval.jsonl> …]

Chính sách so sánh: `conf` (hiện tại: độ tin cậy theo đơn hàng, khối lượng chuỗi qua
gate ≥ 0.1), `lr` (hồi quy logistic, ~30 trọng số), `gb` (gradient boosting, để xem
trần của một model phi tuyến).
"""

import json
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

POOL = {"dev", "free-dev", "free-test"}


def read(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


train_path, *eval_paths = sys.argv[1:]
train = read(train_path)
FEATS = list(train[0]["f"].keys())


def matrix(rows):
    out = []
    for r in rows:
        f = r["f"]
        out.append(
            [f[k] for k in FEATS]
            + [
                np.log(max(f["validMass"], 1e-12)),
                np.log(max(1 - f["conf"], 1e-9)),
                np.log(max(1 - f["minMarg"], 1e-9)),
            ]
        )
    return np.array(out, dtype=float)


cand = [r for r in train if r["hasCand"]]
x_train = matrix(cand)
y_train = np.array([r["correct"] for r in cand], dtype=int)
scaler = StandardScaler().fit(x_train)
lr = LogisticRegression(C=1.0, max_iter=2000).fit(scaler.transform(x_train), y_train)
gb = HistGradientBoostingClassifier(
    max_iter=200, learning_rate=0.05, max_leaf_nodes=15
).fit(x_train, y_train)
names = FEATS + ["log_validMass", "log_1-conf", "log_1-minMarg"]
coef = sorted(zip(names, lr.coef_[0]), key=lambda x: -abs(x[1]))
print("Hệ số LR lớn nhất:", ", ".join(f"{n} {w:+.2f}" for n, w in coef[:10]))


def scores(rows, kind):
    """Điểm tự nhận của từng câu; câu không có đơn hàng qua gate luôn escalate (-1)."""
    s = np.full(len(rows), -1.0)
    idx = [i for i, r in enumerate(rows) if r["hasCand"]]
    if not idx:
        return s
    x = matrix([rows[i] for i in idx])
    if kind == "lr":
        s[idx] = lr.predict_proba(scaler.transform(x))[:, 1]
    elif kind == "gb":
        s[idx] = gb.predict_proba(x)[:, 1]
    else:
        f = [rows[i]["f"] for i in idx]
        s[idx] = [g["conf"] if g["validMass"] >= 0.1 else 0 for g in f]
    return s


def at(rows, s, t):
    accepted = s >= t
    n_acc = int(accepted.sum())
    wrong = sum(1 for r, a in zip(rows, accepted) if a and not r["correct"])
    return (
        n_acc / len(rows),
        (wrong / n_acc if n_acc else 0.0),
        (n_acc - wrong) / len(rows),
    )


def threshold_for_risk(rows, s, risk):
    best = 1.01
    for t in sorted(set(np.round(s[s >= 0], 4)), reverse=True):
        if at(rows, s, t)[1] <= risk:
            best = t
    return best


def aurc(rows, s):
    """Diện tích dưới đường rủi ro–độ phủ (thấp hơn là tốt hơn), trên các câu có ứng viên."""
    wrong = 0
    total = 0.0
    k = 0
    for i in np.argsort(-s):
        if s[i] < 0:
            break
        k += 1
        wrong += 0 if rows[i]["correct"] else 1
        total += wrong / k
    return total / max(1, k)


subsets = {}
for path in eval_paths:
    for r in read(path):
        name = r["set"]
        if name in POOL:
            name = "pool"
        subsets.setdefault(f"{path.rsplit('/', 1)[-1]}: {name}", []).append(r)

for target in (0.02, 0.05):
    th = {
        k: threshold_for_risk(cand, scores(cand, k), target)
        for k in ("conf", "lr", "gb")
    }
    print(
        f"\n## Ngưỡng chọn trên train cho rủi ro ≤ {target:.0%}: "
        + ", ".join(f"{k} {v:.3f}" for k, v in th.items())
    )
    print("| Tập | Chính sách | Tự nhận | Sai / tự nhận | Đúng tự động / tổng | AURC |")
    print("|---|---|---|---|---|---|")
    for name, rows in subsets.items():
        for k in ("conf", "lr", "gb"):
            s = scores(rows, k)
            cov, risk, ok = at(rows, s, th[k])
            print(
                f"| {name} | {k} | {cov:.1%} | {risk:.1%} | {ok:.1%} | {aurc(rows, s):.4f} |"
            )
