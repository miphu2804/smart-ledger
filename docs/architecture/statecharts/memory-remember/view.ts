const labels: Record<string, string> = {
  start: "Turn saved, memory task starts",
  marking: "Recording use of recalled memories",
  switch: "Reading the owner's memory switch",
  extracting: "Extracting facts with the extractor model",
  reconciling: "Embedding and reconciling with similar memories",
  storing: "Storing facts, marking the ones they replace",
  summary: "Looking for old groups to summarize",
  group: "Summarizing one group",
  finished: "Finished, every failure only logged",
};
export const state = (v: any) => labels[v.phase];
const groups: Record<string, string> = {
  start: "Start", marking: "Start", switch: "Start",
  extracting: "Learn", reconciling: "Learn", storing: "Learn",
  summary: "Compress", group: "Compress",
  finished: "End",
};
export const group = (v: any) => groups[v.phase];
export const colors = { Start: "blue", Learn: "purple", Compress: "teal", End: "yellow" };
export const title = "Memory: learning after a turn";
const steps: Record<string, string | null> = {
  RecalledSome: "the turn used memories",
  NoneRecalled: "the turn used none",
  UseRecorded: "use count and last use updated",
  SwitchOff: "switch off, or the read fails",
  SwitchOn: "switch on",
  NoFacts: "no new facts, or the extractor fails",
  FactsFound: "facts found",
  NothingNew: "every fact already known",
  NewFacts: "new or replacing facts [all kept if the reconciler fails]",
  Stored: "stored, or the store fails",
  StoreFails: "stored, or the store fails",
  GroupDue: "a group of 2+ memories older than 7 days [3 per turn]",
  NoGroupLeft: "no group due",
  GroupReplaced: "summary replaces the group, or the group is kept",
  GroupKept: "summary replaces the group, or the group is kept",
  Done: null,
};
export const step = (action: string) => steps[action] ?? null;
