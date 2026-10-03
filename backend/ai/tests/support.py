"""Shared data for the AI tests."""

from src.agent.guardrails import GuardrailLimits

# Guardrails stay enabled in tests; these limits are wide enough not to change any case
# that does not target them. Guardrail tests pass their own small limits instead.
TEST_GUARDRAIL_LIMITS = GuardrailLimits(
    max_input_chars=100_000, model_call_limit=100, tool_call_limit=100
)
