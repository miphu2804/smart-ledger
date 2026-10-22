### [2026-10-21 08:55 UTC+07:00] — [Docs] The algorithm explainer cannot be published as a shareable page from this session

**Status:** Open

**Blocked by:** Publishing an Artifact needs a claude.ai login, and this session authenticates with `ANTHROPIC_AUTH_TOKEN`, which takes precedence over a claude.ai account. Every publish is refused with the same message, so retrying does not help.

**Impact:** `backend/ai/evaluation/voice_order/reports/voice-order-resolver-explainer.html` is complete and opens in a browser as a local file, but there is no link to hand to the team. The draw.io diagram is unaffected: it is committed as a file and rendered from `images/voice-order-resolver.svg`.

**Next action:** Unset `ANTHROPIC_AUTH_TOKEN`, run `/login`, and choose the Claude account with subscription, then publish that same file. Alternatively commit the HTML beside the report and link it from `docs/`.

### [2026-10-21 08:52 UTC+07:00] — [Eval] Only Haiku is reachable through the headless `claude -p` CLI

**Status:** Open

**Blocked by:** `claude -p --model claude-opus-5-5` and `claude-sonnet-5-5` both return `API Error: 400 Upstream request failed: Model is unavailable` (re-checked today, both with `--effort medium`). `claude-haiku-5-5 --effort high` works.

**Impact:** The original request to report the voice-order changes to Opus 5.5 at medium effort through `claude -p` cannot be carried out, so no second-model review of the bake-off has happened. All subagent work in this branch was therefore done by Haiku and verified by hand.

**Next action:** Restore access to the larger models, or point the handoff at a model that answers. The report to hand over is `backend/ai/evaluation/voice_order/reports/bakeoff_v1.md` plus `backend/ai/evaluation/voice_order/notes/coordinator.md`.

### [2026-10-21 08:50 UTC+07:00] — [Eval] The plan's STT axis (P5) cannot be measured here

**Status:** Open

**Blocked by:** Plan section 7.1 requires recorded audio, and no audio exists in this repository. There is also no low-end Android device attached to this machine, so the latency budgets in `backend/ai/evaluation/voice_order/configs/selection_rule.json` (`resolveP95MsN5k`, `releaseToUiP95LowEndMs` and the rest) have no way to be measured.

**Impact:** Everything the plan says about greedy against beam search, hotwords, silence padding and overlapped processing is unverified. The D2 confusion weights in `backend/ai/evaluation/voice_order/lib/synth_rules.vi.ts` are start values, not values fitted to real ASR output, so the whole bake-off measures the resolver against synthetic noise rather than against the recogniser it will actually run behind. No row was excluded for latency, and no device-latency claim may be made from the Node timings.

**Next action:** Record a D1 set of real utterances with the product name as spoken, re-fit the D2 confusion weights from it, then run P5 and the latency budgets on a low-end device.

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
