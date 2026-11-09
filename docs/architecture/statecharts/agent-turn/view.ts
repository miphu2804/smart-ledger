const labels: Record<string, string> = {
  reading: "Read history",
  checking: "Validate input",
  recall: "Recall and select",
  writing: "Generate answer",
  tools: "Run tools",
  retrying: "Screen retry",
  ready: "Answer ready",
  saving: "Atomic save",
  done: "Done",
  refused503: "503: unavailable",
  refused404: "404: not found",
  refused422: "422: guardrail",
  failed: "Failed",
  cancelled: "Cancelled",
};
export const state = (v: any) => labels[v.phase];

const groups: Record<string, string> = {
  reading: "Prepare", checking: "Prepare",
  recall: "Recall",
  writing: "Run", tools: "Run", retrying: "Run", ready: "Run",
  saving: "Save", done: "Save",
  refused503: "Stopped", refused404: "Stopped", refused422: "Stopped", failed: "Stopped", cancelled: "Stopped",
};
export const group = (v: any) => groups[v.phase];
export const colors = { Prepare: "blue", Recall: "purple", Run: "teal", Save: "yellow", Stopped: "pink" };
export const title = "Agent chat turn";

const steps: Record<string, string | null> = {
  NoModel: "no chat model is configured",
  HistoryHit: "history read: Redis hit, else the database",
  HistoryFromDb: "history read: Redis hit, else the database",
  NotOwner: "the conversation is another owner's",
  TooLong: "the question is too long",
  InputOk: "the question passes, secrets redacted",
  MemoriesFound: "memories added, or none [off, empty, or failed]",
  RecallEmpty: "memories added, or none [off, empty, or failed]",
  RecallSkipped: "memories added, or none [off, empty, or failed]",
  CallTools: "the model calls tools",
  ToolsReturn: "the tools return",
  ButtonsOnly: "only screen buttons are called",
  ScreenRejects: "the screen rejects the answer",
  WriteAgain: "the model writes again",
  ScreenPasses: "the answer passes the screen",
  RunFails: "timeout, limit, provider error, or app disconnects",
  SendRest: "the rest of the text is sent",
  SaveFails: "the save fails",
  Saved: "the exchange and optional success receipt commit together",
  Cancel: "durable cancellation wins before save",
  Done: null,
};
export const step = (action: string) => steps[action] ?? null;
