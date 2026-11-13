"""Pure rules that decide which proposed facts become memories (ADR-0002).

No I/O: the memory service asks the models for facts and decisions in the shapes
below, and these rules screen what the models return, because a prompt alone does not
bind a model.
"""

import re
from dataclasses import replace
from typing import Literal

from pydantic import BaseModel, Field

from src.memory.repository import NewMemory

# A Vietnamese phone number: 0, 84 or +84, then nine digits that spaces, dots or
# dashes may split. The lookbehind keeps a digit run inside a longer number, such as
# the money amount "120.000.000đ", from matching.
PHONE_NUMBER = re.compile(r"(?<![\d.,])(?:\+84|84|0)(?:[\s.\-]?\d){9}(?!\d)")


class MemoryFact(BaseModel):
    """One fact the extraction model proposes."""

    memory_type: Literal["preference", "semantic", "procedural", "episodic"]
    content: str = Field(min_length=1, max_length=500)
    importance: float = Field(ge=0, le=1)
    # Id of an "Already remembered" fact this one corrects or updates.
    replaces: int | None = None


class MemoryDecision(BaseModel):
    """What one new fact does to the remembered ones, after Hy Memory's reconcile."""

    # 1-based number of the new fact, as listed to the model.
    fact: int
    action: Literal["new", "replaces", "known"]
    replaces: int | None = None


class MemoryFacts(BaseModel):
    """Structured output schema the extraction model must return."""

    facts: list[MemoryFact] = Field(max_length=5)


class MemorySummary(BaseModel):
    """Structured output schema of a summary: never empty, so nothing is lost."""

    facts: list[MemoryFact] = Field(min_length=1, max_length=5)


class MemoryDecisions(BaseModel):
    """Structured output schema the reconcile model must return."""

    decisions: list[MemoryDecision] = Field(max_length=5)


def without_phone_numbers(facts: list[MemoryFact]) -> list[MemoryFact]:
    """`facts` without those that hold a phone number."""
    return [fact for fact in facts if not PHONE_NUMBER.search(fact.content)]


def screened_extraction(
    facts: list[MemoryFact], allowed_types: frozenset[str], recalled_ids: set[int]
) -> list[MemoryFact]:
    """The extracted facts of an allowed type and without a phone number.

    The model could name any id; only a memory this turn recalled may be replaced.
    """
    return [
        fact.model_copy(
            update={
                "replaces": fact.replaces if fact.replaces in recalled_ids else None
            }
        )
        for fact in without_phone_numbers(facts)
        if fact.memory_type in allowed_types
    ]


def reconciled(
    open_facts: list[NewMemory],
    decisions: list[MemoryDecision],
    shown_ids: set[int],
) -> list[NewMemory]:
    """`open_facts` after the reconcile model's decisions.

    A fact marked known is dropped; a fact marked as replacing a memory supersedes it
    only when that memory was shown to the model. A fact without a decision is kept.
    """
    by_fact = {decision.fact: decision for decision in decisions}
    checked = []
    for number, memory in enumerate(open_facts, 1):
        decision = by_fact.get(number)
        if decision is not None and decision.action == "known":
            continue
        if (
            decision is not None
            and decision.action == "replaces"
            and decision.replaces in shown_ids
        ):
            memory = replace(memory, supersedes=decision.replaces)
        checked.append(memory)
    return checked
