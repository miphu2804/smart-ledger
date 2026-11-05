import hashlib
import json
from datetime import date
from pathlib import Path

from evaluation.core.honeyhive import print_sync_plan
from evaluation.core.schema import Case
from evaluation.core.utils import load_yaml
from evaluation.metrics.judge import Judge
from evaluation.metrics.memory import MemoryEvaluator
from evaluation.metrics.performance import PerformanceEvaluator
from evaluation.metrics.response_quality import ResponseQualityEvaluator
from evaluation.metrics.safety import SafetyEvaluator
from evaluation.metrics.task import TaskEvaluator
from evaluation.metrics.tool_use import ToolUseEvaluator
from evaluation.targets.agent import AgentTarget
from evaluation.targets.database import require_local_database
from sqlalchemy import Connection, text

from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient

DIRECTORY = Path(__file__).parent


class AgentChatEval:
    """The chat agent on the seeded shop of `seed.sql`, asked the questions of
    `cases.yaml`.

    The expected figures are computed from the database when the evaluation is built,
    so it refuses a remote database or a shop seeded on another day: a run only scores
    the seeded shop with today's dates.
    """

    name = "agent_chat"
    thresholds = DIRECTORY / "thresholds.toml"
    # Metrics whose passes the console prints per case, as `correct` does for a
    # question asked 3 times.
    summary = ("correct", "tool_choice")

    def __init__(
        self,
        repeats: int,
        judge_alias: str,
        model_alias: str | None = None,
        limit: int | None = None,
    ) -> None:
        require_local_database(app_config.POSTGRES_URL, app_config.AI_SQL_READER_URL)
        self.definition = load_yaml(DIRECTORY / "cases.yaml")
        self.shop_id = self.definition["shop_id"]
        self.started_on = self._get_shop_today()
        self.cases = self._load_cases(repeats, limit)
        judge = Judge(judge_alias, self.shop_id)
        self.target = AgentTarget(
            self.cases[0].inputs["owner_id"],
            self.shop_id,
            self.definition["memories"],
            model_alias,
        )
        self.evaluators = [
            TaskEvaluator(judge),
            ToolUseEvaluator(judge),
            MemoryEvaluator(judge),
            ResponseQualityEvaluator(judge),
            SafetyEvaluator(),
            PerformanceEvaluator(),
        ]

    def check(self) -> None:
        """Fails a run that crossed midnight shop time: the expected answers were
        computed before it, and after it "yesterday" moved."""
        if self._get_shop_today() != self.started_on:
            raise SystemExit("the run crossed midnight shop time; run it again")

    def show_plan(self, name: str) -> None:
        print_sync_plan(name, self.cases)

    def _load_cases(self, repeats: int, limit: int | None) -> list[Case]:
        version = self._compute_version()
        cases = []
        with self._connect() as connection:
            owner_id = self._find_seeded_owner(connection)
            for spec in self.definition["cases"][:limit]:
                cases += self._build_cases(connection, spec, owner_id, version, repeats)
        return cases

    def _find_seeded_owner(self, connection: Connection) -> int:
        """The id of the seeded shop's owner; refuses a shop that is missing or was
        seeded on another day."""
        time_zone, shop_today = (
            self.definition["time_zone"],
            self.definition["shop_today"],
        )
        row = connection.execute(
            text(
                f"SELECT owner_id, (created_at AT TIME ZONE {time_zone})::date = "
                f"{shop_today} FROM shops WHERE id = {self.shop_id}"
            )
        ).one_or_none()
        if row is None:
            raise SystemExit("seed the shop first; see evaluation/agent_chat/README.md")
        owner_id, seeded_today = row
        if not seeded_today:
            raise SystemExit("the seed is from another day; run seed.sql again")
        return owner_id

    def _build_cases(
        self,
        connection: Connection,
        spec: dict,
        owner_id: int,
        version: str,
        repeats: int,
    ) -> list[Case]:
        """One case per repeat of a question of `cases.yaml`."""
        names = self._read_column(connection, spec.get("names"))
        numbers = self._read_column(connection, spec.get("numbers"))
        inputs = {
            "question": spec["question"],
            "follow_up": spec.get("follow_up"),
            "owner_id": owner_id,
            "suite_version": version,
        }
        truth = self._read_truth(spec, names, numbers)
        # The attempt keeps the repeats apart, since HoneyHive keys a datapoint by its
        # content.
        return [
            Case(
                spec["id"],
                {**inputs, "attempt": attempt},
                truth,
                expected=numbers + names,
            )
            for attempt in range(1, repeats + 1)
        ]

    def _read_truth(self, spec: dict, names: list, numbers: list) -> dict:
        """What only the metrics read: the expected names and figures, the judge's
        rubric filled with them, and what the case needs from the agent."""
        rubric = spec.get("judge")
        memory = spec.get("memory")
        return {
            "shop_id": self.shop_id,
            "numbers": numbers,
            "names": names,
            "judge": rubric and rubric.format(names=", ".join(names), numbers=numbers),
            "approximate": spec.get("approximate", False),
            "needs_tool": spec.get("needs_tool", True),
            "memory": self.definition["memories"][memory]["content"]
            if memory
            else None,
        }

    def _compute_version(self) -> str:
        """Changes when a case or the seed changes, so runs on different cases are not
        compared as if only the prompt had moved."""
        cases = json.dumps(
            [self.definition["cases"], self.definition["memories"]],
            sort_keys=True,
            ensure_ascii=False,
        )
        seed = (DIRECTORY / "seed.sql").read_text()
        return hashlib.sha256(f"{cases}\n{seed}".encode()).hexdigest()[:12]

    def _get_shop_today(self) -> date:
        with self._connect() as connection:
            return connection.execute(
                text(f"SELECT {self.definition['shop_today']}")
            ).scalar()

    @staticmethod
    def _connect() -> Connection:
        return PostgreDBClient(app_config.POSTGRES_URL).engine.connect()

    @staticmethod
    def _read_column(connection: Connection, query: str | None) -> list:
        """The query's values; a sum over no rows is NULL, which means zero here."""
        if query is None:
            return []
        values = connection.execute(text(query)).scalars().all()
        return [
            value if isinstance(value, str) else float(value or 0) for value in values
        ]
