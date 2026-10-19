"""Arithmetic for the shop agent: a closed op set run in-process by the
CalculationService. The agent reaches it through the `calculate` tool
(`src/agent/tools.py`). This package stays framework-free: model-written programs in
the Monty sandbox are the agent's separate sandbox option (`src/sandbox/`), which
uses no code from here."""
