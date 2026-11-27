---- MODULE AgentTurn ----
\* One chat turn of AgentService, POST /agent/chat and /agent/chat/stream.
VARIABLES phase, conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt
vars == <<phase, conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>

Refused == {"refused503", "refused404", "refused422"}
Ends == Refused \cup {"failed", "done", "cancelled"}

Init ==
  /\ phase = "reading"
  /\ conv \in {"new", "cached", "stored", "foreign"}
  /\ memoryOn \in BOOLEAN
  /\ hasMemory \in BOOLEAN
  /\ embedded = FALSE
  /\ modelCalled = FALSE
  /\ saved = FALSE
  /\ durable \in BOOLEAN
  /\ receipt = IF durable THEN "IN_PROGRESS" ELSE "LEGACY"

Go(from, to) == phase = from /\ phase' = to

NoModel == Go("reading", "refused503") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
HistoryHit == Go("reading", "checking") /\ conv \in {"new", "cached"} /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
HistoryFromDb == Go("reading", "checking") /\ conv = "stored" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
NotOwner == Go("reading", "refused404") /\ conv = "foreign" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
TooLong == Go("checking", "refused422") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
InputOk == Go("checking", "recall") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
MemoriesFound == Go("recall", "writing") /\ memoryOn /\ hasMemory /\ embedded' = TRUE /\ modelCalled' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, saved, durable, receipt>>
RecallEmpty == Go("recall", "writing") /\ memoryOn /\ hasMemory /\ embedded' = TRUE /\ modelCalled' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, saved, durable, receipt>>
RecallSkipped == Go("recall", "writing") /\ ~(memoryOn /\ hasMemory) /\ modelCalled' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, saved, durable, receipt>>
CallTools == Go("writing", "tools") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
ToolsReturn == Go("tools", "writing") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
ScreenRejects == Go("writing", "retrying") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
WriteAgain == Go("retrying", "writing") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
ScreenPasses == Go("writing", "ready") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
RunFails == phase \in {"writing", "tools", "retrying"} /\ phase' = "failed" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
SendRest == Go("ready", "saving") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
SaveFails == Go("saving", "failed") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable, receipt>>
Saved == Go("saving", "done") /\ (~durable \/ receipt = "IN_PROGRESS") /\ saved' = TRUE /\ receipt' = (IF durable THEN "SUCCEEDED" ELSE "LEGACY") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, durable>>
Cancel == phase \notin Ends /\ durable /\ receipt = "IN_PROGRESS" /\ phase' = "cancelled" /\ receipt' = "CANCELLED" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved, durable>>
Done == phase \in Ends /\ UNCHANGED vars

Next ==
  NoModel \/ HistoryHit \/ HistoryFromDb \/ NotOwner \/ TooLong \/ InputOk
  \/ MemoriesFound \/ RecallEmpty \/ RecallSkipped
  \/ CallTools \/ ToolsReturn \/ ScreenRejects \/ WriteAgain \/ ScreenPasses
  \/ RunFails \/ SendRest \/ SaveFails \/ Saved \/ Cancel \/ Done

\* A refused turn never reaches the model.
RefusedBeforeModel == phase \in Refused => ~modelCalled
\* Another owner's conversation never reaches the model.
ForeignNeverAnswered == conv = "foreign" => ~modelCalled
\* The question of an owner who switched memory off is never embedded.
MemoryOffNeverEmbedded == embedded => memoryOn
\* A failed turn stores nothing.
FailedStoresNothing == phase = "failed" => ~saved
\* The done event comes only after the exchange is saved.
DoneAfterSave == phase = "done" => saved
CancelledCannotSave == phase = "cancelled" => ~saved
SuccessReceiptWithAnswer == durable /\ saved => receipt = "SUCCEEDED"
====
