"""Score the real chat agent on a made-up shop and sync only the scores to HoneyHive.

The agent runs here with tracing off, every answer is scored here, and each case is then
logged to HoneyHive as one session of an experiment run, with its inputs, outputs and
scores but no spans, as in "Sync Offline Evaluations" in HoneyHive's docs. That keeps a
run to one event per case and sends no span to HoneyHive.
"""

import argparse
import asyncio
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

from honeyhive import HoneyHive  # noqa: E402
from honeyhive.models import (  # noqa: E402
    PostExperimentRunRequest,
    PutExperimentRunRequest,
)
from opentelemetry.sdk.trace import TracerProvider  # noqa: E402
from opentelemetry.sdk.trace.export import SimpleSpanProcessor  # noqa: E402
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (  # noqa: E402
    InMemorySpanExporter,
)
from pydantic import BaseModel, Field  # noqa: E402
from pydantic_ai import Agent  # noqa: E402
from pydantic_ai.models.instrumented import InstrumentationSettings  # noqa: E402
from sqlalchemy import text  # noqa: E402

from src.agent.service import (  # noqa: E402
    Done,
    MemoryRecalled,
    Reset,
    TextDelta,
    ToolStarted,
)
from src.app_config import app_config  # noqa: E402
from src.infra.postgre_db_client import PostgreDBClient  # noqa: E402
from src.memory.repository import NewMemory  # noqa: E402
from src.memory.service import AgentMemoryService  # noqa: E402
from src.providers.llm_factory import LLMFactory  # noqa: E402
from src.providers.session_settings import session_settings  # noqa: E402

# The app must not start its own tracer: the run sends scores, not spans. Memory is on
# for recall only; `without_memory_writes` stops what a turn would store, because that
# would change the next run's answers.
HONEYHIVE_KEY = app_config.HH_API_KEY
app_config.HH_API_KEY = None
app_config.AGENT_MEMORY_ENABLED = True

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
        "id": "memory_rice_supplier",
        "question": "Gạo ST25 bên mình nhập của ai và giao vào ngày nào nhỉ?",
        "memory": "rice_supplier",
        "judge": "Shop nhập gạo ST25 từ cô Ba ở chợ Bến Thành, giao vào thứ Hai hằng "
        "tuần. Đạt khi câu trả lời nói nhà cung cấp là cô Ba và ngày giao là thứ Hai. "
        "Không đạt khi câu trả lời nêu người hoặc ngày khác, hoặc nói không biết.",
        "needs_tool": False,
    },
    {
        "id": "memory_debt_habit",
        "question": "Anh Hùng thường trả nợ vào lúc nào trong tuần?",
        "memory": "debt_habit",
        "judge": "Anh Hùng hay hẹn trả nợ vào cuối tuần, thường là chiều thứ Bảy. Đạt "
        "khi câu trả lời nói anh Hùng thường trả vào cuối tuần hoặc thứ Bảy. Không đạt "
        "khi câu trả lời nêu ngày khác, hoặc nói không biết.",
        "needs_tool": False,
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
# Facts stored before the run, each embedded the way the app embeds its own memories.
# A case with `memory` is answerable only from that fact, and is scored on whether the
# recall returned it.
MEMORIES = {
    "rice_supplier": {
        "memory_type": "semantic",
        "content": "Gạo ST25 của shop nhập từ cô Ba ở chợ Bến Thành, giao hàng vào "
        "mỗi thứ Hai.",
    },
    "debt_habit": {
        "memory_type": "semantic",
        "content": "Anh Hùng hay mua chịu và hẹn trả nợ vào cuối tuần, thường là "
        "chiều thứ Bảy.",
    },
}
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
# The most a tool result or a memory takes in a prompt to the judge or in the outputs.
RESULT_CHARS = 500
RATING_INSTRUCTIONS = (
    "Please act as an impartial judge. Your evaluation should consider the mentioned "
    "criteria. Give a short explanation first, as objectively as possible, then rate "
    "on a scale of 1 to 5."
)


class Verdict(BaseModel):
    passed: bool
    reason: str


class Rating(BaseModel):
    reason: str
    score: int = Field(ge=1, le=5)


def trace_tools() -> InMemorySpanExporter:
    """Records every agent's spans in memory, which is where the arguments and results
    of a turn's tool calls are read from; nothing leaves the process."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    Agent.instrument_all(
        InstrumentationSettings(
            tracer_provider=provider,
            include_content=True,
            include_binary_content=False,
        )
    )
    return exporter


def without_memory_writes(memory: AgentMemoryService) -> None:
    """Keeps recall but drops what a turn would store."""

    async def skip(*arguments, **keywords) -> None:
        return None

    memory.remember = skip


def memory_for(
    datapoint: dict, memory: AgentMemoryService
) -> AgentMemoryService | None:
    """Recall runs only in the memory cases.

    The seeded facts would otherwise lead every other case's prompt, because recall
    has no score cut-off, and their results would stop matching earlier runs.
    """
    return memory if datapoint["ground_truth"]["memory"] else None


async def seed_memories(memory: AgentMemoryService, owner_id: int) -> None:
    """Replaces the shop's memories with `MEMORIES`, stored under a new conversation."""
    with memory.repository.postgres.session() as session:
        session.execute(
            text("DELETE FROM agent_memories WHERE shop_id = :shop"), {"shop": SHOP_ID}
        )
        conversation_id = session.execute(
            text(
                "INSERT INTO chat_conversations (user_id, shop_id, title) "
                "VALUES (:owner, :shop, 'memory seed') RETURNING id"
            ),
            {"owner": owner_id, "shop": SHOP_ID},
        ).scalar_one()
    facts = list(MEMORIES.values())
    vectors = await memory.embedder.embed_documents([fact["content"] for fact in facts])
    await asyncio.to_thread(
        memory.repository.add,
        SHOP_ID,
        owner_id,
        conversation_id,
        [
            NewMemory(fact["memory_type"], fact["content"], 0.8, list(vector))
            for fact, vector in zip(facts, vectors.embeddings, strict=True)
        ],
    )


async def answer(agent, exporter: InMemorySpanExporter, datapoint: dict) -> dict:
    """Asks the question, then the follow-up in the same conversation if there is one;
    the outputs describe the last turn."""
    inputs = datapoint["inputs"]
    turns = (
        [inputs["question"], inputs["follow_up"]]
        if inputs["follow_up"]
        else [inputs["question"]]
    )
    conversation_id = None
    for question in turns:
        exporter.clear()
        reply = ""
        model = ""
        tools: list[str] = []
        memories: list[dict] = []
        started = time.monotonic()
        events = await agent.stream_chat(
            inputs["owner_id"], SHOP_ID, question, conversation_id
        )
        async for event in events:
            if isinstance(event, ToolStarted):
                tools.append(event.name)
            elif isinstance(event, MemoryRecalled):
                memories = [
                    {
                        "id": memory.id,
                        "content": memory.content,
                        "memory_type": memory.memory_type,
                        "score": memory.relevance,
                    }
                    for memory in event.memories
                ]
            elif isinstance(event, TextDelta):
                reply += event.text
            elif isinstance(event, Reset):
                reply = ""
            elif isinstance(event, Done):
                reply = event.result.answer
                model = event.result.model_version
                conversation_id = event.result.conversation_id
    spans = sorted(exporter.get_finished_spans(), key=lambda span: span.start_time)
    # The model, prompt and suite version travel with every row, so two runs in
    # HoneyHive or in results/ show what changed between them.
    return {
        "answer": reply,
        "tools": tools,
        "tool_calls": tool_calls_in(spans),
        "available_tools": available_tools_in(spans),
        "memories": memories,
        "seconds": round(time.monotonic() - started, 2),
        "model": model,
        "prompt_version": agent.prompt_version,
        "suite_version": inputs["suite_version"],
    }


def tool_calls_in(spans: list) -> list[dict]:
    """The tool calls of the turn in order, each result cut short."""
    return [
        {
            "name": span.attributes["gen_ai.tool.name"],
            "arguments": json.loads(span.attributes["gen_ai.tool.call.arguments"]),
            "result": str(span.attributes["gen_ai.tool.call.result"])[:RESULT_CHARS],
        }
        for span in spans
        if span.name.startswith("execute_tool ")
    ]


def available_tools_in(spans: list) -> str:
    """The tool definitions the model was given, as its first request carried them."""
    return next(
        (
            span.attributes["gen_ai.tool.definitions"]
            for span in spans
            if "gen_ai.tool.definitions" in span.attributes
        ),
        "[]",
    )


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


def recalled_expected(outputs: dict, inputs: dict, ground_truth: dict) -> int | None:
    """Whether the recall returned the fact the case can only be answered from; None
    for a case that needs no memory."""
    if ground_truth["memory"] is None:
        return None
    return int(
        any(
            memory["content"] == ground_truth["memory"]
            for memory in outputs["memories"]
        )
    )


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
    return await grade(
        alias,
        Verdict,
        "Bạn chấm câu trả lời của một trợ lý cửa hàng theo đúng tiêu "
        "chí được cho. Chỉ xét tiêu chí, không xét văn phong. reason ngắn, bằng "
        "tiếng Việt.",
        f"Câu hỏi: {question}\n\nTiêu chí: {rubric}\n\nCâu trả lời:\n{answer_text}",
    )


async def rate(prompt: str, alias: str) -> dict:
    """Rates 1 to 5 against a prompt adapted from a HoneyHive evaluator template."""
    return await grade(alias, Rating, RATING_INSTRUCTIONS, prompt)


async def grade(alias: str, output_type, instructions: str, prompt: str) -> dict:
    grader = Agent(
        LLMFactory(app_config).create_model(alias),
        output_type=output_type,
        instructions=instructions,
    )
    result = await grader.run(
        prompt,
        # The gateway rejects a request that names no session, as the app's runs do.
        model_settings=session_settings(uuid.uuid4().hex, SHOP_ID),
    )
    return result.output.model_dump()


# The prompts below are HoneyHive's evaluator templates (docs.honeyhive.ai, "Evaluator
# Templates"), with each field they read mapped to this case's outputs. A builder
# returns None when the template does not apply to the case.


def tool_usage_prompt(outputs: dict, inputs: dict, truth: dict) -> str:
    """Tool Usage."""
    return f"""[Criteria]
1. Tool Selection: Did the assistant choose the most appropriate tool for the task?
2. Tool Usage: Was the tool used correctly and effectively?
3. Necessity: Was the tool usage necessary or could the task be accomplished without it?
4. Integration: How well was the tool output integrated into the response?

[The Start of Available Tools]
{outputs["available_tools"]}
[The End of Available Tools]

[The Start of User Query]
{question_of(inputs)}
[The End of User Query]

[The Start of Assistant's Actions]
{actions_of(outputs)}
[The End of Assistant's Actions]"""


def failure_recovery_prompt(outputs: dict, inputs: dict, truth: dict) -> str | None:
    """Failure Recovery, for a turn where a tool answered with an error."""
    if not any(call["result"].startswith("Error[") for call in outputs["tool_calls"]):
        return None
    return f"""[Criteria]
Failure Recovery: The agent should handle errors gracefully. It should:
- Detect when errors or failures occur
- Implement appropriate recovery strategies
- Avoid cascading failures or error loops
- Provide useful feedback about what went wrong and how it was addressed

[User Input]
{question_of(inputs)}
[End of Input]

[The Start of Agent Response with Error Handling]
{actions_of(outputs)}

Final answer: {outputs["answer"]}
[The End of Agent Response]"""


def answer_faithfulness_prompt(outputs: dict, inputs: dict, truth: dict) -> str:
    """Answer Faithfulness, against the tool results and the recalled memories."""
    context = [call["result"] for call in outputs["tool_calls"]]
    context += [memory["content"] for memory in outputs["memories"]]
    return f"""[Criteria]
The answer generated by the AI assistant should be faithful to the provided
context and should not include information that isn't supported by the context.

[The Start of Provided Context]
{chr(10).join(context) or "(none)"}
[The End of Provided Context]

[The Start of AI Assistant's Answer]
{outputs["answer"]}
[The End of AI Assistant's Answer]"""


def context_relevance_prompt(outputs: dict, inputs: dict, truth: dict) -> str | None:
    """Context Relevance, of the memories recalled, for a case that needs one."""
    if truth["memory"] is None:
        return None
    retrieved = json.dumps(outputs["memories"], ensure_ascii=False)
    return f"""[Criteria]
The context fetched by the retriever should be relevant to the user's initial query.

[The Start of User's Query]
{question_of(inputs)}
[The End of User's Query]

[The Start of Retriever's Context]
{retrieved}
[The End of Retriever's Context]"""


def tool_trajectory_prompt(outputs: dict, inputs: dict, truth: dict) -> str | None:
    """Tool Trajectory, for a turn that called a tool."""
    if not outputs["tool_calls"]:
        return None
    calls = "\n".join(
        f"- {call['name']}({json.dumps(call['arguments'], ensure_ascii=False)[:200]})"
        for call in outputs["tool_calls"]
    )
    return f"""Evaluate whether the agent called tools in a logical, minimal order to
resolve the user's request. Below are the user's goal and the ordered tool calls.
Rate 1 (wrong or wasteful tool use) to 5 (correct and efficient).

[User goal]
{question_of(inputs)[:400]}

[Tool calls in order]
{calls}"""


def question_of(inputs: dict) -> str:
    return inputs["follow_up"] or inputs["question"]


def actions_of(outputs: dict) -> str:
    if not outputs["tool_calls"]:
        return "(no tool calls)"
    return json.dumps(outputs["tool_calls"], ensure_ascii=False, indent=1)


JUDGED = {
    "tool_usage": tool_usage_prompt,
    "failure_recovery": failure_recovery_prompt,
    "answer_faithfulness": answer_faithfulness_prompt,
    "context_relevance": context_relevance_prompt,
    "tool_trajectory": tool_trajectory_prompt,
}


async def judged_scores(outputs: dict, inputs: dict, truth: dict, rate_prompt) -> dict:
    """Each template's rating for the cases it applies to, with the judge's reason in
    the outputs so a low rating can be read."""
    scores = {}
    for name, build in JUDGED.items():
        prompt = build(outputs, inputs, truth)
        if prompt is None:
            continue
        rating = await rate_prompt(prompt)
        scores[name] = rating["score"]
        outputs.setdefault("judge_reasons", {})[name] = rating["reason"]
    return scores


def suite_version() -> str:
    """Changes when a case or the seed changes, so runs on different suites are not
    compared as if only the prompt had moved."""
    cases = json.dumps([CASES, MEMORIES], sort_keys=True, ensure_ascii=False)
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
                    "memory": MEMORIES[case["memory"]]["content"]
                    if "memory" in case
                    else None,
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


async def run_all(dataset: list[dict], judge_alias: str) -> list[dict]:
    """Answers and scores every datapoint one after another, so `seconds` measures the
    agent and not a shared rate limit. A datapoint that raises is logged and left
    out."""
    exporter = trace_tools()
    results = []
    async with lifespan(app):
        agent = app.state.agent
        memory = app.state.memory
        without_memory_writes(memory)
        await seed_memories(memory, dataset[0]["inputs"]["owner_id"])
        for datapoint in dataset:
            agent.memory = memory_for(datapoint, memory)
            try:
                results.append(await score(agent, exporter, datapoint, judge_alias))
            except Exception as error:
                print(
                    f"{datapoint['ground_truth']['case']} failed: {error!r}",
                    file=sys.stderr,
                )
    return results


async def score(
    agent, exporter: InMemorySpanExporter, datapoint: dict, judge_alias: str
) -> dict:
    outputs = await answer(agent, exporter, datapoint)
    inputs, truth = datapoint["inputs"], datapoint["ground_truth"]
    if truth["judge"]:
        outputs["verdict"] = await judge(
            question_of(inputs), outputs["answer"], truth["judge"], judge_alias
        )
    metrics = {
        "correct": correct(outputs, inputs, truth)["score"],
        "tool_choice": tool_choice(outputs, inputs, truth),
        "tool_calls": tool_calls(outputs, inputs, truth),
        "seconds": seconds(outputs, inputs, truth),
        "recalled_expected": recalled_expected(outputs, inputs, truth),
        **await judged_scores(
            outputs, inputs, truth, lambda prompt: rate(prompt, judge_alias)
        ),
    }
    return {
        "datapoint": datapoint,
        "outputs": outputs,
        # A case a metric does not apply to has no value for it.
        "metrics": {
            name: value for name, value in metrics.items() if value is not None
        },
    }


def report(name: str, results: list[dict], expected_rows: int) -> None:
    """Prints each case's passes across its repeats, then the totals, and keeps every
    row locally so a run can be read without opening HoneyHive. A datapoint that raised
    has no row, so a short run fails instead of scoring only the rest."""
    if not results:
        raise SystemExit("no answers were recorded")
    rows = [
        {
            "case": result["datapoint"]["ground_truth"]["case"],
            "correct": result["metrics"]["correct"],
            "tool_choice": result["metrics"]["tool_choice"],
            "expected": result["datapoint"]["ground_truth"]["numbers"]
            + result["datapoint"]["ground_truth"]["names"],
            **result["metrics"],
            **result["outputs"],
        }
        for result in results
    ]
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


def session_payload(run_id: str, name: str, result: dict) -> dict:
    """One case as a session of the run: inputs, outputs and scores, no spans."""
    datapoint = result["datapoint"]
    case, attempt = datapoint["ground_truth"]["case"], datapoint["inputs"]["attempt"]
    outputs = result["outputs"]
    return {
        "session": {
            "session_name": f"agent-chat-{name}",
            "source": "evaluation",
            "session_id": str(uuid.uuid4()),
            "inputs": datapoint["inputs"],
            "outputs": outputs,
            "metrics": result["metrics"],
            "metadata": {
                "run_id": run_id,
                # The same for a case in every run, so HoneyHive pairs it across runs.
                "datapoint_id": str(
                    uuid.uuid5(uuid.NAMESPACE_URL, f"agent-chat/{case}/{attempt}")
                ),
                "case": case,
                "model": outputs["model"],
                "prompt_version": outputs["prompt_version"],
                "suite_version": outputs["suite_version"],
            },
        }
    }


def sync_scores(client: HoneyHive, name: str, results: list[dict]) -> None:
    """Creates the run, logs each case as a session and completes the run."""
    run = client.experiments.create_run(
        PostExperimentRunRequest(
            name=f"agent-chat-{name}", event_ids=[], status="pending"
        )
    )
    session_ids = [
        client.sessions.start(session_payload(run.run_id, name, result)).session_id
        for result in results
    ]
    client.experiments.update_run(
        run.run_id, PutExperimentRunRequest(event_ids=session_ids, status="completed")
    )
    print(f"synced {len(session_ids)} sessions to run {run.run_id}")


def print_sync_plan(name: str, dataset: list[dict]) -> None:
    """Shows the run and the first session that a real run would send, with the answer
    and the scores empty because a dry run asks no model."""
    first = {
        "datapoint": dataset[0],
        "outputs": {
            "model": "",
            "prompt_version": "",
            "suite_version": dataset[0]["inputs"]["suite_version"],
        },
        "metrics": {},
    }
    cases = {datapoint["ground_truth"]["case"] for datapoint in dataset}
    print(f"{len(dataset)} datapoints from {len(cases)} cases")
    print(f"would create run agent-chat-{name}, then log one session per datapoint:")
    print(
        json.dumps(
            session_payload("<run_id>", name, first), ensure_ascii=False, indent=1
        )
    )


def shop_today() -> date:
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        return connection.execute(text(f"SELECT {SHOP_TODAY}")).scalar()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="baseline")
    parser.add_argument("--repeats", type=int, default=3)
    # The chat model grades itself by default; a stronger alias gives fairer grades.
    parser.add_argument("--judge", default="chat", help="model alias for the judge")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="build the dataset and show what would sync, asking no model and "
        "calling no HoneyHive",
    )
    arguments = parser.parse_args()
    started_on = shop_today()
    dataset = build_dataset(arguments.repeats)
    if arguments.dry_run:
        print_sync_plan(arguments.name, dataset)
        return
    results = asyncio.run(run_all(dataset, arguments.judge))
    report(arguments.name, results, len(dataset))
    if HONEYHIVE_KEY:
        sync_scores(
            HoneyHive(api_key=HONEYHIVE_KEY, server_url=app_config.HH_API_URL),
            arguments.name,
            results,
        )
    else:
        print("HH_API_KEY is unset; the scores stay in results/")
    # The expected answers were computed before midnight; after it, "yesterday" moved.
    if shop_today() != started_on:
        raise SystemExit("the run crossed midnight shop time; run it again")


if __name__ == "__main__":
    main()
