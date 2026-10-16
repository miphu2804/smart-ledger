"""SmartLedger Core load test.

Simulates OWNER app sessions against Core over HTTP. Core proxies Agent chat to
AI, so AI is exercised only through `/api/v1/agent/*`. Read README.md first: the
run refuses to start until TARGET_ENV, --host and the test accounts are set."""

from __future__ import annotations

import logging
import os
import sys
import uuid

import gevent
from gevent.lock import Semaphore
from locust import HttpUser, LoadTestShape, between, events, task
from locust.exception import StopUser
from locust.runners import WorkerRunner

import config
import slo
from auth import AuthError, TokenPool
from shapes import TRACKER, build_stages

logger = logging.getLogger("loadtest")
SETTINGS = config.load()
POOL: TokenPool | None = None
API = "/api/v1"


@events.init.add_listener
def _check_settings(environment, **_kwargs) -> None:
    global POOL
    problems = config.check(SETTINGS, environment.host)
    if problems:
        for problem in problems:
            logger.error("refusing to start: %s", problem)
        sys.exit(2)
    try:
        if SETTINGS.auth_mode == "static":
            POOL = TokenPool.from_static_file(SETTINGS.tokens_file)
        else:
            POOL = TokenPool.from_csv(SETTINGS.accounts_file, SETTINGS.firebase_api_key)
    except AuthError as error:
        logger.error("refusing to start: %s", error)
        sys.exit(2)
    logger.info(
        "target=%s host=%s profile=%s accounts=%d writes=%s chat_users=%d",
        SETTINGS.target_env,
        environment.host,
        SETTINGS.profile,
        len(POOL),
        SETTINGS.writes,
        SETTINGS.chat_users,
    )


@events.quitting.add_listener
def _slo_gate(environment, **_kwargs) -> None:
    if isinstance(environment.runner, WorkerRunner):
        return
    verdicts, passed = slo.evaluate(environment.stats, SETTINGS.profile)
    if TRACKER.results:
        logger.info("stage summary:")
        for step in TRACKER.results:
            p95 = "n/a" if step.p95_ms is None else f"{step.p95_ms:.0f}"
            logger.info(
                "  %-16s users=%-5d running=%-5d rps=%-8.1f fail=%.2f%% p95=%s ms",
                step.label,
                step.users,
                step.running_users,
                step.rps,
                step.fail_ratio * 100,
                p95,
            )
    if TRACKER.stopped_reason:
        logger.info("stress stopped: %s", TRACKER.stopped_reason)
    print(slo.report(verdicts, passed, environment.stats.total))
    # The gate decides the exit code; Locust alone would exit 1 on any failed request,
    # even when the failure ratio is inside the SLO.
    environment.process_exit_code = 0 if passed else 1


class OwnerSession:
    """Shared request helpers: bearer token, X-Shop-Id and response checks."""

    client = None  # provided by HttpUser

    def start_session(self) -> None:
        if POOL is None:
            raise StopUser()
        self.account = POOL.next_account()
        self.shop_id: int | None = None
        # The app opens a session after every sign-in; it is idempotent for an
        # existing profile and returns the shops the account may use. Under stress the
        # session call itself can fail: retry it, so the run keeps the user count the
        # stage reports instead of silently shedding users.
        body, attempt = None, 0
        while body is None:
            if attempt:
                delay = min(30, 2**attempt)
                logger.warning("%s session failed; retrying in %ds", self.account.label, delay)
                gevent.sleep(delay)
            attempt += 1
            body = self.call("auth", "POST", f"{API}/auth/session", json={}, shop=False)
        shops = [s for s in body.get("shops", []) if s.get("status") == "ACTIVE"]
        if not shops:
            logger.error("%s has no ACTIVE shop; create one before the run", self.account.label)
            raise StopUser()
        self.shop_id = shops[0]["id"]

    def headers(self, shop: bool) -> dict[str, str]:
        try:
            token = POOL.token(self.account)
        except AuthError as error:
            logger.error("%s", error)
            raise StopUser() from error
        headers = {"Authorization": f"Bearer {token}"}
        if shop and self.shop_id is not None:
            headers["X-Shop-Id"] = str(self.shop_id)
        return headers

    def call(
        self,
        group: str,
        method: str,
        path: str,
        *,
        name: str | None = None,
        params: dict | None = None,
        json: dict | None = None,
        extra_headers: dict[str, str] | None = None,
        expect: tuple[int, ...] = (200, 201),
        shop: bool = True,
        timeout: float = 30,
    ):
        headers = self.headers(shop)
        if extra_headers:
            headers.update(extra_headers)
        label = f"[{group}] {name or path}"
        with self.client.request(
            method,
            path,
            name=label,
            params=params,
            json=json,
            headers=headers,
            timeout=timeout,
            catch_response=True,
        ) as response:
            if response.status_code not in expect:
                code = _error_code(response)
                response.failure(f"HTTP {response.status_code} {code}".strip())
                return None
            if response.status_code == 204 or not response.content:
                response.success()
                return {}
            try:
                body = response.json()
            except ValueError:
                response.failure("response is not JSON")
                return None
            response.success()
            return body


def _error_code(response) -> str:
    try:
        return str(response.json().get("code", ""))
    except (ValueError, AttributeError):
        return ""


class OwnerUser(OwnerSession, HttpUser):
    """An OWNER moving around the app. Task weights are an assumption of how the
    app is used (home dashboard most, lists next, reports less); replace them with
    measured traffic once analytics exist."""

    wait_time = between(SETTINGS.think_min, SETTINGS.think_max)

    def on_start(self) -> None:
        self.start_session()

    @task(4)
    def home_summary(self) -> None:
        self.call("report", "GET", f"{API}/reports/summary", params={"period": "today"})

    @task(2)
    def unread_notifications(self) -> None:
        self.call("read", "GET", f"{API}/me/notifications/unread-count", shop=False)

    @task(3)
    def product_list(self) -> None:
        self.call("read", "GET", f"{API}/products", params={"page": 0, "size": 20})

    @task(1)
    def product_search(self) -> None:
        self.call(
            "read",
            "GET",
            f"{API}/products",
            name=f"{API}/products?q",
            params={"page": 0, "size": 20, "q": "a"},
        )

    @task(2)
    def sale_list(self) -> None:
        self.call("read", "GET", f"{API}/sales", params={"page": 0, "size": 20})

    @task(1)
    def debt_list(self) -> None:
        self.call("read", "GET", f"{API}/debts", params={"page": 0, "size": 20, "status": "OPEN"})

    @task(1)
    def customer_list(self) -> None:
        self.call("read", "GET", f"{API}/customers", params={"page": 0, "size": 20})

    @task(1)
    def expense_list(self) -> None:
        self.call(
            "read", "GET", f"{API}/expenses", params={"page": 0, "size": 20, "period": "month"}
        )

    @task(1)
    def reports_week(self) -> None:
        self.call("report", "GET", f"{API}/reports/top-products", params={"period": "week"})
        self.call("report", "GET", f"{API}/reports/sales-series", params={"period": "week"})

    @task(1)
    def profit_month(self) -> None:
        self.call("report", "GET", f"{API}/reports/profit-estimate", params={"period": "month"})

    @task(2)
    def sell_one_item(self) -> None:
        """Draft then confirm: the only path that creates a sale (writes only)."""
        if not SETTINGS.writes:
            return
        draft = self.call(
            "write",
            "POST",
            f"{API}/sale-drafts",
            json={
                "initialPaidVnd": 1000,
                "initialPaymentMethod": "CASH",
                "items": [
                    {
                        "productName": "[loadtest] item",
                        "unit": "cái",
                        "quantity": 1,
                        "unitPriceVnd": 1000,
                    }
                ],
            },
        )
        if draft and draft.get("id"):
            self.call(
                "write",
                "POST",
                f"{API}/sale-drafts/{draft['id']}/confirm",
                name=f"{API}/sale-drafts/{{draftId}}/confirm",
            )

    @task(1)
    def record_expense(self) -> None:
        if not SETTINGS.writes:
            return
        self.call(
            "write",
            "POST",
            f"{API}/expenses",
            json={"description": "[loadtest] expense", "amountVnd": 1000},
            extra_headers={"Idempotency-Key": str(uuid.uuid4())},
        )


_CHAT_LOCK = Semaphore()
_CHAT_SENT = 0


def _reserve_chat() -> bool:
    """Global cap per Locust process; with --processes or workers, each one counts
    separately, so divide CHAT_MAX_REQUESTS by the process count."""
    global _CHAT_SENT
    with _CHAT_LOCK:
        if _CHAT_SENT >= SETTINGS.chat_max:
            return False
        _CHAT_SENT += 1
        return True


class AgentChatUser(OwnerSession, HttpUser):
    """Asks one question per new conversation, then deletes it. Every turn calls
    the model and costs money, so the class runs only with CHAT_USERS > 0."""

    abstract = SETTINGS.chat_users <= 0
    fixed_count = max(SETTINGS.chat_users, 0)
    wait_time = between(10, 30)

    def on_start(self) -> None:
        self.start_session()

    @task
    def ask(self) -> None:
        if not _reserve_chat():
            raise StopUser()
        answer = self.call(
            "chat",
            "POST",
            f"{API}/agent/chat",
            json={"message": "Hôm nay tiệm bán được bao nhiêu?"},
            timeout=60,
        )
        conversation_id = (answer or {}).get("conversation_id")
        if conversation_id:
            self.call(
                "chat",
                "DELETE",
                f"{API}/agent/conversations/{conversation_id}",
                name=f"{API}/agent/conversations/{{id}}",
                expect=(204,),
            )


if SETTINGS.profile != "manual" and SETTINGS.profile in config.PROFILES:

    class ProfileShape(LoadTestShape):
        """Drives users from LOAD_PROFILE. Not defined for `manual`, so -u/-r work."""

        def __init__(self) -> None:
            super().__init__()
            self.stages = build_stages(SETTINGS.profile)
            self.stage_index = 0
            self.stop_fail_ratio = float(os.getenv("STRESS_STOP_FAIL_RATIO") or "0.05")
            self.stop_p95_ms = float(os.getenv("STRESS_STOP_P95_MS") or "3000")

        def tick(self):
            run_time = self.get_run_time()
            while (
                self.stage_index < len(self.stages)
                and run_time >= self.stages[self.stage_index].until
            ):
                finished = self.stages[self.stage_index]
                result = TRACKER.sample(finished, self.runner.stats, self.runner.user_count)
                self.stage_index += 1
                if SETTINGS.profile == "stress" and self._broken(result):
                    return None
            if self.stage_index >= len(self.stages):
                return None
            stage = self.stages[self.stage_index]
            return stage.users + SETTINGS.chat_users, stage.spawn_rate

        def _broken(self, result) -> bool:
            if result.fail_ratio > self.stop_fail_ratio:
                TRACKER.stopped_reason = (
                    f"{result.label}: fail ratio {result.fail_ratio:.1%}"
                    f" > {self.stop_fail_ratio:.1%}"
                )
                return True
            if result.p95_ms is not None and result.p95_ms > self.stop_p95_ms:
                TRACKER.stopped_reason = (
                    f"{result.label}: p95 {result.p95_ms:.0f} ms > {self.stop_p95_ms:.0f} ms"
                )
                return True
            return False
