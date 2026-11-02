"""Score the real chat agent on a made-up shop and log the run to HoneyHive.

Each datapoint runs the app's own lifespan because `evaluate` gives an async function
its own event loop.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import uuid
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from honeyhive.experiments import evaluate  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from pydantic_ai import Agent  # noqa: E402
from pydantic_ai.models.instrumented import InstrumentationSettings  # noqa: E402
from sqlalchemy import text  # noqa: E402

from src.agent.service import Done, Reset, TextDelta, ToolStarted  # noqa: E402
from src.app_config import app_config  # noqa: E402
from src.infra.postgre_db_client import PostgreDBClient  # noqa: E402
from src.providers.llm_factory import LLMFactory  # noqa: E402
from src.providers.session_settings import session_settings  # noqa: E402

# `evaluate` opens a tracer per datapoint, so the app must not start its own; memory is
# off because what one run stores would change the next run's answers.
HONEYHIVE_KEY = app_config.HH_API_KEY
app_config.HH_API_KEY = None
app_config.AGENT_MEMORY_ENABLED = False

from src.main import app, lifespan  # noqa: E402

SHOP_ID = 9001
HERE = Path(__file__).parent
RESULTS = HERE / "results"
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")
TIME_ZONE = "'Asia/Ho_Chi_Minh'"
SHOP_TODAY = f"(now() AT TIME ZONE {TIME_ZONE})::date"
MONTH_START = f"date_trunc('month', now() AT TIME ZONE {TIME_ZONE})"
LAST_MONTH_START = f"({MONTH_START} - interval '1 month') AT TIME ZONE {TIME_ZONE}"
THIS_MONTH_START = f"{MONTH_START} AT TIME ZONE {TIME_ZONE}"
# Shifted in local time, so the window starts on the 1st, not a day early.
MONTH_BEFORE_LAST_START = (
    f"({MONTH_START} - interval '2 month') AT TIME ZONE {TIME_ZONE}"
)
CONFIRMED = f"shop_id = {SHOP_ID} AND sale_status = 'CONFIRMED'"
LAST_MONTH_SALES = f"""
    {CONFIRMED}
    AND sold_at >= {LAST_MONTH_START} AND sold_at < {THIS_MONTH_START}
"""
LAST_MONTH_REVENUE = f"SELECT sum(total_vnd) FROM sales WHERE {LAST_MONTH_SALES}"
MONTH_BEFORE_LAST_REVENUE = f"""
    SELECT sum(total_vnd) FROM sales
    WHERE {CONFIRMED}
    AND sold_at >= {MONTH_BEFORE_LAST_START} AND sold_at < {LAST_MONTH_START}
"""
LAST_MONTH_EXPENSES = f"""
    SELECT sum(amount_vnd) FROM expenses
    WHERE shop_id = {SHOP_ID} AND status = 'ACTIVE'
    AND expense_at >= {LAST_MONTH_START} AND expense_at < {THIS_MONTH_START}
"""
OPEN_DEBTS = f"""
    FROM debts d JOIN sales s ON s.id = d.sale_id
    WHERE s.shop_id = {SHOP_ID} AND d.status = 'OPEN'
"""

# The expected answer is SQL against the base tables, not a stored number: the seed
# dates sales from today, and the agent only reads the views, so a wrong view shows up.
# A case with `judge` is graded by a model against that rubric, filled with the
# expected names and numbers, because a phrase or a name is too loose for a regex.
CASES = [
    {
        "id": "revenue_last_month",
        "question": "Tháng trước shop bán được bao nhiêu tiền?",
        "numbers": LAST_MONTH_REVENUE,
    },
    {
        "id": "orders_last_month",
        "question": "Tháng trước có bao nhiêu đơn hàng, không tính đơn đã hủy?",
        "numbers": f"SELECT count(*) FROM sales WHERE {LAST_MONTH_SALES}",
    },
    {
        "id": "revenue_yesterday",
        "question": "Hôm qua doanh thu bao nhiêu?",
        "numbers": f"""
            SELECT sum(total_vnd) FROM sales
            WHERE {CONFIRMED}
            AND (sold_at AT TIME ZONE {TIME_ZONE})::date = {SHOP_TODAY} - 1
        """,
    },
    {
        "id": "revenue_today",
        "question": "Hôm nay bán được bao nhiêu tiền rồi?",
        "numbers": f"""
            SELECT sum(total_vnd) FROM sales
            WHERE {CONFIRMED}
            AND (sold_at AT TIME ZONE {TIME_ZONE})::date = {SHOP_TODAY}
        """,
    },
    {
        # The seed sells at 00:30 on the 1st, which is still last month in UTC.
        "id": "revenue_month_to_date",
        "question": "Từ đầu tháng này tới giờ doanh thu bao nhiêu?",
        "numbers": f"""
            SELECT sum(total_vnd) FROM sales
            WHERE {CONFIRMED} AND sold_at >= {THIS_MONTH_START}
        """,
    },
    {
        "id": "top_product_last_month",
        "question": "Tháng trước mặt hàng nào bán được nhiều nhất theo số lượng?",
        "names": f"""
            WITH sold AS (
                SELECT i.product_name_snapshot AS name, sum(i.quantity) AS quantity
                FROM sale_items i JOIN sales s ON s.id = i.sale_id
                WHERE {LAST_MONTH_SALES.replace("shop_id", "s.shop_id")}
                GROUP BY 1
            )
            SELECT name FROM sold WHERE quantity = (SELECT max(quantity) FROM sold)
        """,
        "judge": "Mặt hàng bán nhiều nhất theo số lượng tháng trước là: {names}. "
        "Đạt khi câu trả lời nói rõ mặt hàng đó là mặt hàng bán nhiều nhất. "
        "Không đạt khi câu trả lời gọi một mặt hàng khác là bán nhiều nhất, "
        "hoặc chỉ liệt kê các mặt hàng mà không nói mặt hàng nào nhiều nhất.",
    },
    {
        # Repayments lower the debt but not the sale's paid_vnd, so total minus paid
        # overstates what is owed.
        "id": "debt_total",
        "question": "Khách đang nợ shop tổng cộng bao nhiêu?",
        "numbers": f"SELECT sum(d.outstanding_vnd) {OPEN_DEBTS}",
    },
    {
        "id": "debt_count",
        "question": "Có bao nhiêu khoản nợ chưa thu?",
        "numbers": f"SELECT count(*) {OPEN_DEBTS}",
    },
    {
        # The agent's views carry no low_stock_threshold, so the honest answer is that
        # the minimum is unknown; a list of the lowest stock is not an answer to this.
        "id": "low_stock_unknown",
        "question": "Mặt hàng nào đang dưới mức tồn kho tối thiểu?",
        "judge": "Dữ liệu agent đọc được không có mức tồn kho tối thiểu của từng "
        "mặt hàng. Đạt khi câu trả lời nói rõ là không có hoặc không biết mức tối "
        "thiểu nên chưa xác định được mặt hàng nào dưới mức đó; liệt kê tồn kho "
        "hiện tại để tham khảo vẫn đạt. Không đạt khi câu trả lời khẳng định mặt "
        "hàng nào đó đang dưới mức tối thiểu, khẳng định không có mặt hàng nào dưới "
        "mức tối thiểu, hoặc tự đặt một ngưỡng rồi coi đó là mức của shop.",
    },
    {
        "id": "expenses_last_month",
        "question": "Tháng trước shop chi hết bao nhiêu tiền?",
        "numbers": LAST_MONTH_EXPENSES,
    },
    {
        "id": "net_last_month",
        "question": "Tháng trước doanh thu trừ chi phí còn lại bao nhiêu?",
        "numbers": f"SELECT ({LAST_MONTH_REVENUE}) - ({LAST_MONTH_EXPENSES})",
    },
    {
        "id": "discount_last_month",
        "question": "Tháng trước shop đã giảm giá cho khách tổng cộng bao nhiêu?",
        "numbers": f"SELECT sum(discount_vnd) FROM sales WHERE {LAST_MONTH_SALES}",
    },
    {
        "id": "stock_unaccented",
        "question": "mi hao hao con bao nhieu goi",
        "numbers": f"""
            SELECT stock_quantity FROM products
            WHERE shop_id = {SHOP_ID} AND name = 'Mì Hảo Hảo'
        """,
    },
    {
        "id": "selling_price",
        "question": "Dầu ăn Neptune bán giá bao nhiêu?",
        "numbers": f"""
            SELECT selling_price_vnd FROM products
            WHERE shop_id = {SHOP_ID} AND name = 'Dầu ăn Neptune 1L'
        """,
    },
    {
        # The seed keeps one archived product, which is no longer on sale.
        "id": "active_products",
        "question": "Shop đang bán bao nhiêu mặt hàng?",
        "numbers": f"""
            SELECT count(*) FROM products
            WHERE shop_id = {SHOP_ID} AND status = 'ACTIVE'
        """,
    },
    {
        "id": "voided_last_month",
        "question": "Tháng trước có mấy đơn bị hủy?",
        "numbers": f"""
            SELECT count(*) FROM sales
            WHERE shop_id = {SHOP_ID} AND sale_status = 'VOIDED'
            AND sold_at >= {LAST_MONTH_START} AND sold_at < {THIS_MONTH_START}
        """,
    },
    {
        "id": "revenue_change",
        "question": "Doanh thu tháng trước chênh bao nhiêu so với tháng trước nữa?",
        "numbers": f"SELECT ({LAST_MONTH_REVENUE}) - ({MONTH_BEFORE_LAST_REVENUE})",
    },
    {
        # The second question names no month, so only the history says which one.
        "id": "follow_up_month",
        "question": "Tháng trước doanh thu bao nhiêu?",
        "follow_up": "Còn tháng trước nữa thì sao?",
        "numbers": MONTH_BEFORE_LAST_REVENUE,
    },
    {
        "id": "debtor_count",
        "question": "Hiện có bao nhiêu khách đang nợ?",
        "numbers": f"SELECT count(DISTINCT d.customer_id) {OPEN_DEBTS}",
    },
    {
        "id": "average_order_last_month",
        "question": "Tháng trước trung bình mỗi đơn bao nhiêu tiền?",
        "numbers": f"SELECT avg(total_vnd) FROM sales WHERE {LAST_MONTH_SALES}",
        # An average is rarely a whole number; 0.1% allows rounding to tens but not
        # an average that counts the voided sales.
        "approximate": True,
    },
    {
        "id": "out_of_scope",
        "question": "Thời tiết Hà Nội hôm nay thế nào?",
        "judge": "Câu hỏi nằm ngoài dữ liệu cửa hàng. Đạt khi câu trả lời từ chối "
        "hoặc nói không có thông tin thời tiết, và không đưa ra nhiệt độ, dự báo hay "
        "tình trạng thời tiết nào, kể cả kèm lời rào đón.",
        "needs_tool": False,
    },
]
UNITS = {
    "tỷ": 1_000_000_000,
    "triệu": 1_000_000,
    "tr": 1_000_000,
    "m": 1_000_000,
    "nghìn": 1000,
    "ngàn": 1000,
    "k": 1000,
}
# "chưa có đơn nào" answers a question whose expected figure is zero.
NONE_SAID = re.compile(r"(chưa|không)\s+(có|bán|phát sinh|ghi nhận)")
rows: list[dict] = []


class Verdict(BaseModel):
    passed: bool
    reason: str


class ContentInstrumentor:
    """Binds every agent to this run's tracer, since the app's own tracer is off."""

    def instrument(self, tracer_provider) -> None:
        Agent.instrument_all(
            InstrumentationSettings(
                tracer_provider=tracer_provider,
                include_content=True,
                include_binary_content=False,
            )
        )

    def uninstrument(self) -> None:
        Agent.instrument_all(False)


async def answer(datapoint: dict) -> dict:
    """Asks the question, then the follow-up in the same conversation if there is one;
    the outputs describe the last turn."""
    inputs = datapoint["inputs"]
    turns = (
        [inputs["question"], inputs["follow_up"]]
        if inputs["follow_up"]
        else [inputs["question"]]
    )
    conversation_id = None
    async with lifespan(app):
        agent = app.state.agent
        for question in turns:
            reply = ""
            model = ""
            tools: list[str] = []
            started = time.monotonic()
            events = await agent.stream_chat(
                inputs["owner_id"], SHOP_ID, question, conversation_id
            )
            async for event in events:
                if isinstance(event, ToolStarted):
                    tools.append(event.name)
                elif isinstance(event, TextDelta):
                    reply += event.text
                elif isinstance(event, Reset):
                    reply = ""
                elif isinstance(event, Done):
                    reply = event.result.answer
                    model = event.result.model_version
                    conversation_id = event.result.conversation_id
    # The model, prompt and suite version travel with every row, so two runs in
    # HoneyHive or in results/ show what changed between them.
    return {
        "answer": reply,
        "tools": tools,
        "seconds": round(time.monotonic() - started, 2),
        "model": model,
        "prompt_version": agent.prompt_version,
        "suite_version": inputs["suite_version"],
    }


def correct(outputs: dict, inputs: dict, ground_truth: dict) -> dict:
    """The judge's verdict for a judged case; otherwise every expected figure
    appears."""
    if ground_truth["judge"]:
        verdict = outputs["verdict"]
        return {"score": int(verdict["passed"]), "explanation": verdict["reason"]}
    found = numbers_in(outputs["answer"])
    missing = [
        number
        for number in ground_truth["numbers"]
        if not any(
            matches(number, value, ground_truth["approximate"]) for value in found
        )
        and not (number == 0 and NONE_SAID.search(outputs["answer"].casefold()))
    ]
    return {"score": 0 if missing else 1, "explanation": f"missing: {missing}"}


def tool_choice(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    """A shop question reads the shop's data; any other question reads none.

    `suggest_screen` and `calculate` read nothing, so only `query_shop_data` counts.
    """
    return int(("query_shop_data" in outputs["tools"]) == ground_truth["needs_tool"])


def tool_calls(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    return len(outputs["tools"])


def seconds(outputs: dict, inputs: dict, ground_truth: dict) -> float:
    return outputs["seconds"]


def numbers_in(answer_text: str) -> list[float]:
    """Each figure in a Vietnamese answer, with unit words applied.

    Dates, times and list markers are dropped first, so the 6 in "tháng 6/2027" or the
    3 in "3. Mì Hảo Hảo" never counts as an answer. "17 triệu 502 nghìn" yields 17
    million, 502 thousand and their sum. Signs are dropped: "giảm 1.715.000" and
    "-1.715.000" state the same change.
    """
    cleaned = re.sub(
        r"\b(ngày|tháng|năm)\s+\d+(/\d+)*"
        r"|\b\d{4}-\d{2}-\d{2}\b"
        r"|\b\d{1,2}/\d{1,2}(/\d{2,4})?\b|\b\d{1,2}/\d{4}\b"
        r"|\b\d{1,2}:\d{2}\b"
        r"|^\s*\d+[.)]\s",
        " ",
        answer_text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    values = []
    compound = None
    compound_scale = None
    previous_end = None
    for match in re.finditer(
        r"(\d[\d.,]*)\s*(tỷ|triệu|tr\b|m\b|nghìn|ngàn|k\b)?\s*", cleaned, re.IGNORECASE
    ):
        digits, unit = match.groups()
        scale = UNITS[unit.lower()] if unit else None
        value = parse_number(digits.rstrip(".,")) * (scale or 1)
        values.append(value)
        # "17 triệu 502 nghìn": a smaller unit right after a larger one adds to it.
        if scale and compound is not None and scale < compound_scale:
            if match.start() == previous_end:
                compound += value
                values.append(compound)
            else:
                compound = value
        else:
            compound = value if scale else None
        compound_scale = scale
        previous_end = match.end()
    return values


def parse_number(digits: str) -> float:
    """Dots and commas group thousands, except a last one followed by one or two
    digits, which is the decimal mark: "149.589,74" and "17.5 triệu" both work."""
    whole, fraction = re.fullmatch(r"(.+?)(?:[.,](\d{1,2}))?", digits).groups()
    number = re.sub(r"[.,]", "", whole)
    return float(f"{number}.{fraction}" if fraction else number)


def matches(expected: float, value: float, approximate: bool) -> bool:
    expected, value = abs(expected), abs(value)
    if approximate:
        return abs(expected - value) <= expected * 0.001
    return expected == value


async def judge(question: str, answer_text: str, rubric: str, alias: str) -> dict:
    """Grades an answer against its rubric with a model from the app's own factory."""
    grader = Agent(
        LLMFactory(app_config).create_model(alias),
        output_type=Verdict,
        instructions="Bạn chấm câu trả lời của một trợ lý cửa hàng theo đúng tiêu "
        "chí được cho. Chỉ xét tiêu chí, không xét văn phong. reason ngắn, bằng "
        "tiếng Việt.",
    )
    result = await grader.run(
        f"Câu hỏi: {question}\n\nTiêu chí: {rubric}\n\nCâu trả lời:\n{answer_text}",
        # The gateway rejects a request that names no session, as the app's runs do.
        model_settings=session_settings(uuid.uuid4().hex, SHOP_ID),
    )
    return result.output.model_dump()


def suite_version() -> str:
    """Changes when a case or the seed changes, so runs on different suites are not
    compared as if only the prompt had moved."""
    cases = json.dumps(CASES, sort_keys=True, ensure_ascii=False)
    seed = (HERE / "seed.sql").read_text()
    return hashlib.sha256(f"{cases}\n{seed}".encode()).hexdigest()[:12]


def build_dataset(repeats: int) -> list[dict]:
    """Refuses a remote database or a shop seeded on another day, so a run only scores
    the seeded shop with today's dates."""
    for url in (app_config.POSTGRES_URL, app_config.AI_SQL_READER_URL):
        if urlsplit(url or "").hostname not in LOCAL_HOSTS:
            raise SystemExit("evaluation runs on the local database only")
    version = suite_version()
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        owner_id, seeded_today = connection.execute(
            text(
                f"SELECT owner_id, (created_at AT TIME ZONE {TIME_ZONE})::date "
                f"= {SHOP_TODAY} FROM shops WHERE id = {SHOP_ID}"
            )
        ).one_or_none() or (None, False)
        if owner_id is None:
            raise SystemExit("seed the shop first; see evaluation/agent_chat/README.md")
        if not seeded_today:
            raise SystemExit("the seed is from another day; run seed.sql again")
        datapoints = []
        for case in CASES:
            names = column(connection, case.get("names"))
            numbers = column(connection, case.get("numbers"))
            rubric = case.get("judge")
            datapoint = {
                "inputs": {
                    "question": case["question"],
                    "follow_up": case.get("follow_up"),
                    "owner_id": owner_id,
                    "suite_version": version,
                },
                "ground_truth": {
                    "case": case["id"],
                    "numbers": numbers,
                    "names": names,
                    "judge": rubric
                    and rubric.format(names=", ".join(names), numbers=numbers),
                    "approximate": case.get("approximate", False),
                    "needs_tool": case.get("needs_tool", True),
                },
            }
            # The attempt keeps the repeats apart, since HoneyHive keys a datapoint
            # by its content.
            datapoints += [
                {**datapoint, "inputs": {**datapoint["inputs"], "attempt": attempt}}
                for attempt in range(1, repeats + 1)
            ]
        return datapoints


def column(connection, query: str | None) -> list:
    """The query's values; a sum over no rows is NULL, which means zero here."""
    if query is None:
        return []
    values = connection.execute(text(query)).scalars().all()
    return [value if isinstance(value, str) else float(value or 0) for value in values]


def recorded(function, judge_alias: str):
    """Judge the answer where a case asks for it, and keep each row locally too, so a
    run can be read without opening HoneyHive."""

    async def answer_and_record(datapoint: dict) -> dict:
        outputs = await function(datapoint)
        inputs, truth = datapoint["inputs"], datapoint["ground_truth"]
        if truth["judge"]:
            question = inputs["follow_up"] or inputs["question"]
            outputs["verdict"] = await judge(
                question, outputs["answer"], truth["judge"], judge_alias
            )
        rows.append(
            {
                "case": truth["case"],
                "correct": correct(outputs, inputs, truth)["score"],
                "tool_choice": tool_choice(outputs, inputs, truth),
                "expected": truth["numbers"] + truth["names"],
                **outputs,
            }
        )
        return outputs

    answer_and_record.__name__ = function.__name__
    return answer_and_record


def report(name: str, expected_rows: int) -> None:
    """Prints each case's passes across its repeats, then the totals; a datapoint
    that raised has no row, so a short run fails instead of scoring only the rest."""
    if not rows:
        raise SystemExit("no answers were recorded")
    by_case: dict[str, list[dict]] = {}
    for row in rows:
        by_case.setdefault(row["case"], []).append(row)
    for case, attempts in by_case.items():
        passed = sum(row["correct"] for row in attempts)
        chose = sum(row["tool_choice"] for row in attempts)
        slowest = max(row["seconds"] for row in attempts)
        print(f"{passed}/{len(attempts)} {chose}/{len(attempts)} {slowest:>6}s {case}")
    first = rows[0]
    print(
        f"correct {sum(r['correct'] for r in rows)}/{len(rows)}, "
        f"tool choice {sum(r['tool_choice'] for r in rows)}/{len(rows)}, "
        f"model {first['model']}, prompt {first['prompt_version']}, "
        f"suite {first['suite_version']}"
    )
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{name}.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1) + "\n"
    )
    if len(rows) < expected_rows:
        raise SystemExit(f"{expected_rows - len(rows)} datapoints failed; see the log")


def shop_today() -> date:
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        return connection.execute(text(f"SELECT {SHOP_TODAY}")).scalar()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="baseline")
    parser.add_argument("--repeats", type=int, default=3)
    # The chat model grades itself by default; a stronger alias gives fairer grades.
    parser.add_argument("--judge", default="chat", help="model alias for the judge")
    arguments = parser.parse_args()
    started_on = shop_today()
    dataset = build_dataset(arguments.repeats)
    evaluate(
        recorded(answer, arguments.judge),
        dataset=dataset,
        evaluators=[correct, tool_choice, tool_calls, seconds],
        instrumentors=[ContentInstrumentor],
        api_key=HONEYHIVE_KEY,
        server_url=app_config.HH_API_URL,
        name=f"agent-chat-{arguments.name}",
        # One at a time, so `seconds` measures the agent and not a shared rate limit.
        max_workers=1,
        print_results=False,
    )
    report(arguments.name, len(dataset))
    # The expected answers were computed before midnight; after it, "yesterday" moved.
    if shop_today() != started_on:
        raise SystemExit("the run crossed midnight shop time; run it again")


if __name__ == "__main__":
    main()
