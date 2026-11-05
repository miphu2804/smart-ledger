---- MODULE AgentTurn ----
\* One chat turn of AgentService, POST /agent/chat and /agent/chat/stream.
VARIABLES phase, conv, memoryOn, hasMemory, embedded, modelCalled, saved
vars == <<phase, conv, memoryOn, hasMemory, embedded, modelCalled, saved>>

Refused == {"refused503", "refused404", "refused422"}
Ends == Refused \cup {"failed", "done"}

Init ==
  /\ phase = "reading"
  /\ conv \in {"new", "cached", "stored", "foreign"}
  /\ memoryOn \in BOOLEAN
  /\ hasMemory \in BOOLEAN
  /\ embedded = FALSE
  /\ modelCalled = FALSE
  /\ saved = FALSE

Go(from, to) == phase = from /\ phase' = to

NoModel == Go("reading", "refused503") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
HistoryHit == Go("reading", "checking") /\ conv \in {"new", "cached"} /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
HistoryFromDb == Go("reading", "checking") /\ conv = "stored" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
NotOwner == Go("reading", "refused404") /\ conv = "foreign" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
TooLong == Go("checking", "refused422") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
InputOk == Go("checking", "recall") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
MemoriesFound == Go("recall", "writing") /\ memoryOn /\ hasMemory /\ embedded' = TRUE /\ modelCalled' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, saved>>
RecallEmpty == Go("recall", "writing") /\ memoryOn /\ hasMemory /\ embedded' = TRUE /\ modelCalled' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, saved>>
RecallSkipped == Go("recall", "writing") /\ ~(memoryOn /\ hasMemory) /\ modelCalled' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, saved>>
CallTools == Go("writing", "tools") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
ToolsReturn == Go("tools", "writing") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
ButtonsOnly == Go("tools", "ready") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
ScreenRejects == Go("writing", "retrying") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
WriteAgain == Go("retrying", "writing") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
ScreenPasses == Go("writing", "ready") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
RunFails == phase \in {"writing", "tools", "retrying"} /\ phase' = "failed" /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
SendRest == Go("ready", "saving") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
SaveFails == Go("saving", "failed") /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled, saved>>
Saved == Go("saving", "done") /\ saved' = TRUE /\ UNCHANGED <<conv, memoryOn, hasMemory, embedded, modelCalled>>
Done == phase \in Ends /\ UNCHANGED vars

Next ==
  NoModel \/ HistoryHit \/ HistoryFromDb \/ NotOwner \/ TooLong \/ InputOk
  \/ MemoriesFound \/ RecallEmpty \/ RecallSkipped
  \/ CallTools \/ ToolsReturn \/ ButtonsOnly \/ ScreenRejects \/ WriteAgain \/ ScreenPasses
  \/ RunFails \/ SendRest \/ SaveFails \/ Saved \/ Done

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
====
