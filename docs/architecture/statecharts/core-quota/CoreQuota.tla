---- MODULE CoreQuota ----
EXTENDS Naturals, FiniteSets
\* Two logical keys/handlers, two time windows, one slot per window.
\* Atomic actions abstract SQL transactions; failed HTTP/unknown reads stutter.
VARIABLES state, captured, receipt, fence, started, reserved, committed, current, delivered
vars == <<state, captured, receipt, fence, started, reserved, committed, current, delivered>>
Turns == {1, 2}
Windows == {1, 2}
Init == /\ state = [t \in Turns |-> "NEW"]
        /\ captured = [t \in Turns |-> 0]
        /\ receipt = [t \in Turns |-> "EMPTY"]
        /\ fence = [t \in Turns |-> 1]
        /\ started = {} /\ delivered = {}
        /\ reserved = [w \in Windows |-> 0]
        /\ committed = [w \in Windows |-> 0] /\ current = 1

Admit(t) == /\ state[t] = "NEW" /\ reserved[current] + committed[current] < 1
            /\ state' = [state EXCEPT ![t] = "PENDING"]
            /\ captured' = [captured EXCEPT ![t] = current]
            /\ reserved' = [reserved EXCEPT ![current] = @ + 1]
            /\ UNCHANGED <<receipt, fence, started, committed, current, delivered>>
Dispatch(t) == /\ state[t] = "PENDING" /\ receipt[t] = "EMPTY" /\ t \notin started
               /\ receipt' = [receipt EXCEPT ![t] = "RUNNING"]
               /\ started' = started \cup {t}
               /\ UNCHANGED <<state, captured, fence, reserved, committed, current, delivered>>
Save(t) == /\ receipt[t] = "RUNNING"
           /\ receipt' = [receipt EXCEPT ![t] = "SUCCEEDED"]
           /\ UNCHANGED <<state, captured, fence, started, reserved, committed, current, delivered>>
Fail(t) == /\ receipt[t] = "RUNNING"
           /\ receipt' = [receipt EXCEPT ![t] = "FAILED"]
           /\ UNCHANGED <<state, captured, fence, started, reserved, committed, current, delivered>>
Claim(t) == /\ state[t] = "PENDING" /\ fence[t] = 1
            /\ fence' = [fence EXCEPT ![t] = 2]
            /\ UNCHANGED <<state, captured, receipt, started, reserved, committed, current, delivered>>
Cancel(t) == /\ state[t] = "PENDING" /\ receipt[t] \in {"EMPTY", "RUNNING"}
             /\ receipt' = [receipt EXCEPT ![t] = "CANCELLED"]
             /\ UNCHANGED <<state, captured, fence, started, reserved, committed, current, delivered>>
Settle(t, workerFence) ==
    /\ state[t] = "PENDING" /\ fence[t] = workerFence
    /\ receipt[t] \in {"SUCCEEDED", "FAILED", "CANCELLED"}
    /\ state' = [state EXCEPT ![t] = (IF receipt[t] = "SUCCEEDED" THEN "SUCCESS" ELSE "RELEASED")]
    /\ reserved' = [reserved EXCEPT ![captured[t]] = @ - 1]
    /\ committed' = [committed EXCEPT ![captured[t]] = @ + (IF receipt[t] = "SUCCEEDED" THEN 1 ELSE 0)]
    /\ UNCHANGED <<captured, receipt, fence, started, current, delivered>>
Replay(t) == /\ state[t] = "SUCCESS" /\ t \notin delivered
             /\ delivered' = delivered \cup {t}
             /\ UNCHANGED <<state, captured, receipt, fence, started, reserved, committed, current>>
Rollover == /\ current = 1 /\ current' = 2
            /\ UNCHANGED <<state, captured, receipt, fence, started, reserved, committed, delivered>>
Next == (\E t \in Turns: Admit(t) \/ Dispatch(t) \/ Save(t) \/ Fail(t) \/ Claim(t) \/ Cancel(t)
                       \/ (\E f \in {1, 2}: Settle(t, f)) \/ Replay(t))
        \/ Rollover \/ UNCHANGED vars

Capacity == \A w \in Windows: reserved[w] + committed[w] <= 1
ExactAccounting == \A w \in Windows:
    /\ reserved[w] = Cardinality({t \in Turns: state[t] = "PENDING" /\ captured[t] = w})
    /\ committed[w] = Cardinality({t \in Turns: state[t] = "SUCCESS" /\ captured[t] = w})
NoUnknownRelease == \A t \in Turns: state[t] = "RELEASED" => receipt[t] \in {"FAILED", "CANCELLED"}
NoRefundedSuccess == \A t \in Turns: receipt[t] = "SUCCEEDED" => state[t] # "RELEASED"
DoneAfterDebit == \A t \in delivered: state[t] = "SUCCESS" /\ receipt[t] = "SUCCEEDED"
NoGenerationWithoutSlot == \A t \in started: captured[t] \in Windows
====
