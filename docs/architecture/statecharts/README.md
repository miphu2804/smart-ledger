# AI statecharts

Five statecharts trace Core quota accounting, AI chat execution, durable receipts and agent memory. TLC checks the rules listed below on the reachable states of each model, not the implementation. The memory charts retain their staging review from 2026-11-05; the chat, durable-turn and Core-quota models/charts are updated for the unmerged phase-five/six features on 2026-11-08. An implementation, a default-off flag and integrated acceptance are separate facts.

| Chart | Code | Model |
|---|---|---|
| [Core quota admission and recovery](#core-quota-admission-and-recovery) | `ChatQuotaLedger`, `ChatQuotaService`, `ChatQuotaRecovery` | [`core-quota/`](core-quota/) |
| [Agent chat turn](#agent-chat-turn) | `AgentService.chat` and `stream_chat` in `src/agent/service.py` | [`agent-turn/`](agent-turn/) |
| [Durable logical turn](#durable-logical-turn) | `AgentTurnService`, `AgentTurnRepository`, atomic exchange save | [`durable-turn/`](durable-turn/) |
| [Memory: learning after a turn](#memory-learning-after-a-turn) | `AgentMemoryService.remember` in `src/memory/service.py` | [`memory-remember/`](memory-remember/) |
| [Memory: one stored fact](#memory-one-stored-fact) | `MemoryRepository` in `src/memory/repository.py` | [`memory-row/`](memory-row/) |

## Agent chat turn

![Agent chat turn statechart](agent-turn/agent-turn.svg)

Where each state shows up while debugging:

| State | Trace or log |
|---|---|
| Read history | `history_ms` in the session metadata: 1-2 ms on a Redis hit, about 200 ms or more from the database |
| Recall and select | spans `memory ready`, `memory recall` and `llm router`; both branches run together under `asyncio.gather` |
| Model writing the answer, Tools running | the Pydantic AI model and tool spans; `first_text_ms` in the session metadata |
| Atomic save | span `save turn` |
| Failed | `metadata.error` on the session, set by `fail_turn` with the guardrail code, the exception type or `cancelled` |

Rules TLC checks:

- `RefusedBeforeModel`: a refused turn never reaches the model.
- `ForeignNeverAnswered`: another owner's conversation never reaches the model.
- `MemoryOffNeverEmbedded`: the question of an owner who switched memory off is never sent to the embedding provider.
- `FailedStoresNothing`: a failed turn stores no chat exchange; a durable failure receipt may still exist.
- `DoneAfterSave`: the `done` event comes only after the exchange is saved.
- `CancelledCannotSave`: cancellation that wins the receipt lock prevents a saved exchange.
- `SuccessReceiptWithAnswer`: an opt-in saved exchange has a successful receipt in the same transaction.

The model leaves out JSON's lack of stream events, the order between recall/tier selection, classifier failures and Core status mapping. It abstracts an already-admitted durable execution, with claim/retry/recovery in the model below. The legacy path still has an unfenced threaded-save disconnect race. The opt-in path serializes save and cancellation through the receipt: a committed success can be recovered, or cancellation prevents late persistence. It does not assume that cancelling a coroutine stops a database thread or a remote model call.

## Durable logical turn

![Durable logical turn statechart](durable-turn/durable-turn.svg)

The bounded model represents one logical key, two delivery/worker instances, a durable claim, crash/retry, atomic save, cancellation/fence and result deletion. IN_PROGRESS after restart returns 202, without a replacement generation; phase-six Core uses receipt/cancel under independent default-off gates, modeled separately below. SUCCEEDED survives result deletion while replay becomes 410. The shortened chart labels are a maintained projection of these model actions, not an execution trace.

TLC checks `AtMostOneGeneration`, `SuccessIsAtomic`, `CancelledCannotPublish`, `DeletionNeverResurrects` and `ReplayOnlySuccess`. Scope/fingerprint validation, database lock waits/deadlocks, HTTP/AnyIO cancellation mechanics, provider calls, timestamps and eventual recovery are outside this finite abstraction; PostgreSQL/endpoint tests cover their implemented boundaries separately. No liveness or automatic recovery guarantee is claimed.

Local model evidence on 2026-11-08: AgentTurn explores 340 distinct states; DurableTurn explores 49, with no invariant errors or queued states remaining. TLC is 1.8.0 build d8fb231 from the [official TLA+ release](https://github.com/tlaplus/tlaplus/releases/tag/v1.8.0), JAR SHA256 e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f. Run `java -XX:+UseParallelGC -cp "$TLA2TOOLS" tlc2.TLC -workers 1 -metadir <scratch> -config <absolute-config-path> <absolute-spec-path>`; keep checkpoints and generated traces outside the source tree. Mermaid SVG rendering with Pele 1.9.0 is a separate check, as described below. Neither check certifies runtime or deployment acceptance.

## Core quota admission and recovery

![Core quota statechart](core-quota/core-quota.svg)

The bounded CoreQuota model has two logical keys/handlers, two time windows and one slot per window to expose last-slot contention. Admission/settlement are atomic SQL abstractions. It includes dispatch delayed past recovery, independent receipt save, failure/cancellation tombstones, a new recovery fence, old/new-handler settlement, rollover and replay after debit. Unknown reads, crash gaps and unavailable networks stutter without freeing capacity; no action regenerates a turn.

TLC checks Capacity, ExactAccounting, NoUnknownRelease, NoRefundedSuccess, DoneAfterDebit and NoGenerationWithoutSlot. CoreQuota explores 1,786 distinct states with no invariant errors and no queued states remaining on 2026-11-08 using the TLC version/JAR above. The maintained Mermaid/SVG is a projection of those actions, not generated execution evidence. Window IDs are immutable after admission; paid calendar arithmetic, database lock scheduling, real HTTP framing, client deletion and eventual recovery are outside this model and require runtime/integration tests. The [Core guide](../../../backend/core/docs/ai-chat-quota.md) owns operational timings and rollout.

## Memory: learning after a turn

![Memory learning statechart](memory-remember/memory-remember.svg)

The task runs after `save_exchange`, so the owner never waits for it, and each failure only logs a warning. The logs to look for are `memory not stored`, `memory use not recorded` and `memory stored: shop=... facts=N`.

Rules TLC checks:

- `SwitchOffLearnsNothing`: nothing is extracted, stored or summarized for an owner whose switch is off or cannot be read.
- `AtMostThreeGroups`: one turn summarizes at most `SUMMARY_GROUPS_PER_TURN` (3) groups.

The model leaves out the extractor's filters (allowed types, phone numbers, which recalled ids it may replace) and the reconciler's per-fact decision; both only change which facts reach "Storing facts".

## Memory: one stored fact

![Memory row statechart](memory-row/memory-row.svg)

Recall and search read only Live rows: `superseded_by` is null and `expires_at` is null or in the future. When a group is merged, rows the group had superseded are pointed at the summary row, which starts Live with the group's latest date and summed use count. Forgetting resolves the newest version first, then deletes every version, because `superseded_by` is `ON DELETE SET NULL` and an older version would otherwise come back. Turning the switch off keeps every row; recall and learning are skipped until it is on again.

Rule TLC checks: `OnlyLiveRecalled`, only a Live row is handed to the model.

## Regenerate

Each chart hides only the steps that stay in an end state. Run the `statechart` skill from a scratch folder outside the repository with TLC (`TLA2TOOLS` pointing at `tla2tools.jar`, Java 11 or later), then render the Mermaid with Pele 1.9.0 and the shared theme:

```bash
statechart agent-turn/AgentTurn.tla --config agent-turn/AgentTurn.cfg --view agent-turn/view.ts --out /tmp/agent-turn
```

```bash
node render.mjs /tmp/agent-turn/chart.mmd agent-turn/agent-turn.svg
```

`render.mjs` imports `pele`, so copy it and `theme.css` next to an `npm install pele@1.9.0` outside the repository and run it there. The theme is light only, so each chart stays on a white background in any viewer.
