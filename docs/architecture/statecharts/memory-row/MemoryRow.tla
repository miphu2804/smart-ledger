---- MODULE MemoryRow ----
\* One agent_memories row, from insert to deletion.
VARIABLES status, recalled
vars == <<status, recalled>>
Init == status = "live" /\ recalled = FALSE

Go(from, to) == status = from /\ status' = to
Recall == status = "live" /\ status' = "used" /\ recalled' = TRUE
UseRecorded == status = "used" /\ status' = "live" /\ recalled' = FALSE
Replaced == Go("live", "superseded") /\ recalled' = FALSE
Expires == Go("live", "expired") /\ recalled' = FALSE
Merged == Go("live", "merged") /\ recalled' = FALSE
Forget == status \in {"live", "superseded"} /\ status' = "forgotten" /\ recalled' = FALSE
Done == status \in {"expired", "merged", "forgotten"} /\ UNCHANGED vars

Next == Recall \/ UseRecorded \/ Replaced \/ Expires \/ Merged \/ Forget \/ Done

\* Only a live row is handed to the model.
OnlyLiveRecalled == recalled => status = "used"
====
