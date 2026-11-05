---- MODULE Remember ----
\* AgentMemoryService.remember, the background task after a chat turn is saved.
EXTENDS Naturals
VARIABLES phase, switch, stored, groupsDone
vars == <<phase, switch, stored, groupsDone>>
MaxGroups == 3

Init == phase = "start" /\ switch \in {"on", "off", "unreadable"} /\ stored = FALSE /\ groupsDone = 0

Go(from, to) == phase = from /\ phase' = to
Keep == UNCHANGED <<switch, stored, groupsDone>>

RecalledSome == Go("start", "marking") /\ Keep
NoneRecalled == Go("start", "switch") /\ Keep
UseRecorded == Go("marking", "switch") /\ Keep
SwitchOff == Go("switch", "finished") /\ switch # "on" /\ Keep
SwitchOn == Go("switch", "extracting") /\ switch = "on" /\ Keep
NoFacts == Go("extracting", "summary") /\ Keep
FactsFound == Go("extracting", "reconciling") /\ Keep
NothingNew == Go("reconciling", "summary") /\ Keep
NewFacts == Go("reconciling", "storing") /\ Keep
Stored == Go("storing", "summary") /\ stored' = TRUE /\ UNCHANGED <<switch, groupsDone>>
StoreFails == Go("storing", "summary") /\ Keep
GroupDue == Go("summary", "group") /\ groupsDone < MaxGroups /\ Keep
NoGroupLeft == Go("summary", "finished") /\ Keep
GroupReplaced == Go("group", "summary") /\ groupsDone' = groupsDone + 1 /\ UNCHANGED <<switch, stored>>
GroupKept == Go("group", "summary") /\ groupsDone' = groupsDone + 1 /\ UNCHANGED <<switch, stored>>
Done == phase = "finished" /\ UNCHANGED vars

Next ==
  RecalledSome \/ NoneRecalled \/ UseRecorded \/ SwitchOff \/ SwitchOn
  \/ NoFacts \/ FactsFound \/ NothingNew \/ NewFacts \/ Stored \/ StoreFails
  \/ GroupDue \/ NoGroupLeft \/ GroupReplaced \/ GroupKept \/ Done

\* Nothing new is learned for an owner whose switch is off or unreadable.
SwitchOffLearnsNothing == switch # "on" => (~stored /\ phase \notin {"extracting", "reconciling", "storing", "summary", "group"})
\* One turn summarizes at most three groups.
AtMostThreeGroups == groupsDone <= MaxGroups
====
