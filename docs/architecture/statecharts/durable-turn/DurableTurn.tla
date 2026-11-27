---- MODULE DurableTurn ----
EXTENDS Naturals, FiniteSets
\* One logical key, two delivery/worker instances; hash/scope validation is abstracted.
VARIABLES receipt, fence, workers, started, saved, available, removed, replayed
vars == <<receipt, fence, workers, started, saved, available, removed, replayed>>
Ids == {1, 2}
Init == /\ receipt = "EMPTY" /\ fence = 1
        /\ workers = [w \in Ids |-> "idle"] /\ started = {}
        /\ saved = FALSE /\ available = FALSE /\ removed = FALSE /\ replayed = FALSE

Claim(w) == /\ receipt = "EMPTY" /\ workers[w] = "idle"
            /\ receipt' = "IN_PROGRESS" /\ started' = started \cup {w}
            /\ workers' = [workers EXCEPT ![w] = "running"]
            /\ UNCHANGED <<fence, saved, available, removed, replayed>>
Retry(w) == /\ receipt \in {"IN_PROGRESS", "FAILED", "CANCELLED"}
            /\ workers[w] = "idle" /\ workers' = [workers EXCEPT ![w] = "stopped"]
            /\ UNCHANGED <<receipt, fence, started, saved, available, removed, replayed>>
Save(w) == /\ workers[w] = "running" /\ receipt = "IN_PROGRESS" /\ fence = 1
           /\ receipt' = "SUCCEEDED" /\ saved' = TRUE /\ available' = TRUE
           /\ workers' = [workers EXCEPT ![w] = "done"]
           /\ UNCHANGED <<fence, started, removed, replayed>>
Cancel == /\ receipt \in {"EMPTY", "IN_PROGRESS"} /\ receipt' = "CANCELLED"
          /\ fence' = 2 /\ UNCHANGED <<workers, started, saved, available, removed, replayed>>
RejectLate(w) == /\ workers[w] = "running" /\ receipt = "CANCELLED"
                 /\ workers' = [workers EXCEPT ![w] = "stopped"]
                 /\ UNCHANGED <<receipt, fence, started, saved, available, removed, replayed>>
Fail(w) == /\ workers[w] = "running" /\ receipt = "IN_PROGRESS"
           /\ receipt' = "FAILED" /\ workers' = [workers EXCEPT ![w] = "stopped"]
           /\ UNCHANGED <<fence, started, saved, available, removed, replayed>>
Crash(w) == /\ workers[w] = "running" /\ workers' = [workers EXCEPT ![w] = "idle"]
            /\ UNCHANGED <<receipt, fence, started, saved, available, removed, replayed>>
Replay == /\ receipt = "SUCCEEDED" /\ available /\ replayed' = TRUE
          /\ UNCHANGED <<receipt, fence, workers, started, saved, available, removed>>
DeleteResult == /\ receipt = "SUCCEEDED" /\ available /\ available' = FALSE /\ removed' = TRUE
                /\ UNCHANGED <<receipt, fence, workers, started, saved, replayed>>
Next == (\E w \in Ids: Claim(w) \/ Retry(w) \/ Save(w) \/ RejectLate(w) \/ Fail(w) \/ Crash(w))
        \/ Cancel \/ Replay \/ DeleteResult \/ UNCHANGED vars

AtMostOneGeneration == Cardinality(started) <= 1
SuccessIsAtomic == saved = (receipt = "SUCCEEDED")
CancelledCannotPublish == receipt = "CANCELLED" => ~saved
DeletionNeverResurrects == removed => ~available
ReplayOnlySuccess == replayed => receipt = "SUCCEEDED"
====
