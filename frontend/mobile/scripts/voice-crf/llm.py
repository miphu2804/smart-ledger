"""Chạy LLM (System 2) của `backend/ai` trên bộ câu eval, để `voice:cascade` đo chuỗi parser trên máy → LLM.

Dùng đúng `DraftService` (prompt, model, structured output, matching) của `backend/ai`, không sửa gì ở đó; chạy trong
môi trường uv của `backend/ai`, từ `frontend/mobile`:

    uv run --project ../../backend/ai python scripts/voice-crf/llm.py --out scripts/voice-crf/.data/llm/default.jsonl
    MODEL_REASONING_EFFORT=low uv run --project ../../backend/ai python scripts/voice-crf/llm.py --out …/low.jsonl

Cần `OPENAI_API_KEY` (và mạng tới api.openai.com); `MODEL_NAME`, `MODEL_REASONING_EFFORT` đổi model như `backend/ai`.
Mỗi câu gọi hai chế độ như Core: SALE (món) và EXPENSE (khoản chi), ghi dòng model đề xuất, dòng còn lại sau matching và
thời gian từng lần gọi. Chạy lại cùng `--out` thì bỏ qua câu đã có. Không in câu nào: bộ giữ kín chỉ xem số tổng.
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
AI_ROOT = HERE.parents[3] / "backend" / "ai"
sys.path.insert(0, str(AI_ROOT))

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
    start = time.perf_counter()
    try:
        lines, version = await service._propose(
            mode, text, products if mode == "SALE" else []
        )
    except (
        DraftUnavailableError
    ) as error:  # model lỗi, hết thời gian hoặc trả sai schema
        return {
            "ms": (time.perf_counter() - start) * 1000,
            "error": type(error).__name__,
        }
    ms = (time.perf_counter() - start) * 1000
    result = (
        matching.match_sale(lines, products)
        if mode == "SALE"
        else matching.match_expense(lines)
    )
    return {
        "ms": ms,
        "version": version,
        "lines": [vars(line) for line in lines],
        "items": [vars(item) for item in result.items],
    }


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--sets", default=",".join(FILES), help="gold,free,free2,holdout3")
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()

    model = build_chat_model(app_config)
    if model is None:
        print(
            "Chưa cấu hình model: cần OPENAI_API_KEY (xem backend/ai/.env.example).",
            file=sys.stderr,
        )
        return 1
    service = DraftService(model, catalog=None)  # danh mục truyền thẳng vào _propose
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
    todo = [r for r in rows if r["id"] not in done]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(args.concurrency)
    errors = 0

    async def one(row: dict) -> dict:
        async with sem:
            products = shops[row["catalog"]]
            sale = await run_mode(service, "SALE", row["text"], products)
            expense = await run_mode(service, "EXPENSE", row["text"], products)
            return {
                "id": row["id"],
                "model": app_config.MODEL_NAME,
                "effort": app_config.MODEL_REASONING_EFFORT,
                "sale": sale,
                "expense": expense,
            }

    with args.out.open("a", encoding="utf-8") as out:
        for task in asyncio.as_completed([one(r) for r in todo]):
            row = await task
            errors += "error" in row["sale"] or "error" in row["expense"]
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()
    print(
        f"{len(todo)} câu mới, {len(done)} câu đã có, {errors} câu model lỗi → {args.out} "
        f"({app_config.MODEL_NAME}, effort {app_config.MODEL_REASONING_EFFORT})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
