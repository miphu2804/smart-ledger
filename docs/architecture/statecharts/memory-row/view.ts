const labels: Record<string, string> = {
  live: "Live: recalled when relevant",
  used: "Handed to the model in a turn",
  superseded: "Superseded: hidden, kept as history",
  expired: "Expired: hidden, kept",
  merged: "Deleted: merged into a summary row",
  forgotten: "Deleted with every version",
};
export const state = (v: any) => labels[v.status];
const groups: Record<string, string> = {
  live: "Visible", used: "Visible", superseded: "Hidden", expired: "Hidden", merged: "Gone", forgotten: "Gone",
};
export const group = (v: any) => groups[v.status];
export const colors = { Visible: "teal", Hidden: "tan", Gone: "pink" };
export const title = "Memory: one stored fact";
const steps: Record<string, string | null> = {
  Recall: "a question matches it",
  UseRecorded: "use count updated after the answer",
  Replaced: "a newer fact replaces it",
  Expires: "its expiry passes",
  Merged: "its group is summarized [2+ facts, older than 7 days]",
  Forget: "the owner deletes it or a newer version",
  Done: null,
};
export const step = (action: string) => steps[action] ?? null;
