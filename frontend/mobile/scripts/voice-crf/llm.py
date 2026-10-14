"""Chạy LLM (System 2) của `backend/ai` trên bộ câu eval, để `voice:cascade` đo chuỗi parser trên máy → LLM.

Dùng đúng `DraftService` (prompt, model, structured output, matching) của `backend/ai`, không sửa gì ở đó; chạy trong
môi trường uv của `backend/ai`, từ `frontend/mobile`:

    uv run --project ../../backend/ai python scripts/voice-crf/llm.py --out scripts/voice-crf/.data/llm/default.jsonl
    MODEL_REASONING_EFFORT=low uv run --project ../../backend/ai python scripts/voice-crf/llm.py --out …/low.jsonl

Cần `OPENAI_API_KEY` (mặc định gọi OpenCode Go, `OPENAI_BASE_URL` đổi được); `MODEL_NAME`, `MODEL_REASONING_EFFORT` đổi model như `backend/ai`.
Mỗi câu gọi hai chế độ như Core: SALE (món) và EXPENSE (khoản chi), ghi dòng model đề xuất, dòng còn lại sau matching,
thời gian và số token từng lần gọi. Chạy lại cùng `--out` thì bỏ qua câu đã có.

Ngân sách nhỏ: `--ids` (danh sách do `voice:cascade -- --escalated` ghi: câu bị chặn, theo thứ tự ưu tiên) chỉ gọi những
câu đó và theo thứ tự đó; `--limit` chặn số câu. Hết quota hoặc key sai thì dừng hẳn; lỗi mạng, giới hạn tốc độ, lỗi phía
máy chủ thì bỏ qua câu đó (không ghi, chạy lại sẽ gọi lại). Chỉ lỗi của chính model (sai schema, quá hạn) được ghi lại và
`voice:cascade` tính như hỏi lại. Không in câu nào: bộ giữ kín chỉ xem số tổng.

`--asr <transcript>` (file `asr.py` ghi, mỗi dòng {"id", "text"}) gửi transcript STT thay cho câu vàng, chỉ các câu có
transcript, để `voice:cascade -- --asr-llm` đo chuỗi STT → parser → LLM.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from contextvars import ContextVar
from pathlib import Path

HERE = Path(__file__).resolve().parent
AI_ROOT = HERE.parents[3] / "backend" / "ai"
sys.path.insert(0, str(AI_ROOT))
# Key đang dùng là của OpenCode Go; đặt trước khi nạp `app_config`. Biến môi trường đã đặt thì giữ nguyên.
os.environ.setdefault("OPENAI_BASE_URL", "https://opencode.ai/inference/go/v1")

from pydantic_ai.exceptions import (
    ModelAPIError,
    ModelHTTPError,
    UnexpectedModelBehavior,
)
from src.app_config import app_config
from src.drafts import matching
from src.drafts.catalog import CatalogProduct
from src.drafts.service import DraftService, DraftUnavailableError
from src.providers.factory import build_chat_model

EVAL = HERE / "eval"
FILES = {
    "gold": "gold.jsonl",
    "free": "free.jsonl",
    "free2": "free2.jsonl",
    "holdout3": "holdout3.jsonl",
}


# Token của lần gọi đang chạy: `DraftService._propose` không trả usage, nên bọc `agent.run` để lấy
CALL_USAGE: ContextVar[list] = ContextVar("CALL_USAGE")


class Abort(Exception):
    """Key sai hoặc hết quota: gọi tiếp chỉ ra toàn lỗi."""


def track_usage(service: DraftService) -> None:
    run = service.agent.run

    async def run_tracked(*args, **kwargs):
        result = await run(*args, **kwargs)
        usage = result.usage() if callable(result.usage) else result.usage
        CALL_USAGE.get().append(usage)
        return result

    service.agent.run = run_tracked


def failure(error: Exception) -> str:
    """`model` (sai schema, quá hạn: tính như hỏi lại), `skip` (lỗi tạm) hoặc `abort`."""
    cause = error.__cause__
    if isinstance(cause, ModelHTTPError):
        if cause.status_code in (401, 403) or "insufficient_quota" in str(cause.body):
            return "abort"
        return "skip"  # 429 giới hạn tốc độ, 5xx
    if isinstance(cause, ModelAPIError):
        return "model" if "timed out" in str(cause) else "skip"  # lỗi kết nối
    if isinstance(cause, UnexpectedModelBehavior):
        return "model"
    return "abort"  # lỗi cấu hình: gọi tiếp cũng lỗi y vậy


def catalogs() -> dict[str, list[CatalogProduct]]:
    raw = json.loads((EVAL / "catalogs.json").read_text(encoding="utf-8"))
    # Danh mục eval không có đơn vị; prompt vẫn có cột unit (để trống)
    return {
        name: [
            CatalogProduct(
                id=p["id"], name=p["name"], unit="", selling_price_vnd=p["price"]
            )
            for p in products
        ]
        for name, products in raw.items()
    }


async def run_mode(
    service: DraftService, mode: str, text: str, products: list[CatalogProduct]
) -> dict:
    usage: list = []
    CALL_USAGE.set(usage)
    start = time.perf_counter()
    try:
        lines, version = await service._propose(
            mode, text, products if mode == "SALE" else []
        )
    except DraftUnavailableError as error:
        kind = failure(error)
        if kind == "abort":
            raise Abort(str(error.__cause__)) from error
        return {
            "ms": (time.perf_counter() - start) * 1000,
            "error": type(error.__cause__ or error).__name__,
            "skip": kind == "skip",
        }
    ms = (time.perf_counter() - start) * 1000
    tokens = {
        "input": sum(u.input_tokens for u in usage),
        "output": sum(u.output_tokens for u in usage),
        "reasoning": sum(u.details.get("reasoning_tokens", 0) for u in usage),
        "requests": sum(u.requests for u in usage),
    }
    result = (
        matching.match_sale(lines, products)
        if mode == "SALE"
        else matching.match_expense(lines)
    )
    return {
        "ms": ms,
        "version": version,
        "tokens": tokens,
        "lines": [vars(line) for line in lines],
        "items": [vars(item) for item in result.items],
    }


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--sets", default=",".join(FILES), help="gold,free,free2,holdout3")
    ap.add_argument("--ids", type=Path, help="chỉ các id trong file này, theo thứ tự")
    ap.add_argument("--limit", type=int, help="gọi nhiều nhất bấy nhiêu câu mới")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--asr", type=Path, help="transcript STT thay cho câu vàng")
    args = ap.parse_args()

    model = build_chat_model(app_config)
    if model is None:
        print(
            "Chưa cấu hình model: cần OPENAI_API_KEY (xem backend/ai/.env.example).",
            file=sys.stderr,
        )
        return 1
    service = DraftService(model, catalog=None)  # danh mục truyền thẳng vào _propose
    track_usage(service)
    shops = catalogs()
    done = set()
    if args.out.exists():
        done = {
            json.loads(line)["id"]
            for line in args.out.read_text(encoding="utf-8").splitlines()
            if line.strip()
        }
    rows = []
    for key in args.sets.split(","):
        path = EVAL / FILES[key]
        if path.exists():
            rows += [
                json.loads(line)
                for line in path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
    if args.asr:
        heard = {
            r["id"]: r["text"]
            for r in (
                json.loads(line)
                for line in args.asr.read_text(encoding="utf-8").splitlines()
                if line.strip()
            )
        }
        rows = [{**r, "text": heard[r["id"]]} for r in rows if r["id"] in heard]
    if args.ids:
        order = [i for i in args.ids.read_text().split() if i]
        by_id = {r["id"]: r for r in rows}
        rows = [by_id[i] for i in order if i in by_id]
    todo = [r for r in rows if r["id"] not in done][: args.limit]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    queue = list(reversed(todo))
    count = {"written": 0, "model_error": 0, "skipped": 0}
    total = {"input": 0, "output": 0, "reasoning": 0}
    aborted: list[str] = []

    async def worker(out) -> None:
        while queue and not aborted:
            row = queue.pop()
            products = shops[row["catalog"]]
            try:
                # Core gọi SALE và EXPENSE song song; ở đây gọi lần lượt để giới hạn tốc độ không làm sai thời gian đo
                sale = await run_mode(service, "SALE", row["text"], products)
                expense = await run_mode(service, "EXPENSE", row["text"], products)
            except Abort as error:
                aborted.append(str(error))
                return
            if sale.get("skip") or expense.get("skip"):
                count["skipped"] += 1
                continue
            for mode in (sale, expense):
                for key in total:
                    total[key] += mode.get("tokens", {}).get(key, 0)
            count["written"] += 1
            count["model_error"] += "error" in sale or "error" in expense
            out.write(
                json.dumps(
                    {
                        "id": row["id"],
                        "model": app_config.MODEL_NAME,
                        "effort": app_config.MODEL_REASONING_EFFORT,
                        "sale": sale,
                        "expense": expense,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            out.flush()

    with args.out.open("a", encoding="utf-8") as out:
        await asyncio.gather(*(worker(out) for _ in range(args.concurrency)))
    n = max(1, count["written"])
    print(
        f"{count['written']}/{len(todo)} câu ghi ({count['model_error']} model lỗi, {count['skipped']} lỗi tạm bỏ qua), "
        f"{len(done)} câu đã có → {args.out} ({app_config.MODEL_NAME}, effort {app_config.MODEL_REASONING_EFFORT})\n"
        f"token: {total['input']} vào, {total['output']} ra (trong đó {total['reasoning']} suy luận); "
        f"trung bình mỗi câu {total['input'] // n} vào, {total['output'] // n} ra"
    )
    if aborted:
        print(f"Dừng: {aborted[0][:200]}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
