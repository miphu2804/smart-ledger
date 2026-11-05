const labels: Record<string, string> = {
  reading: "Reading the history",
  checking: "Checking the question",
  recall: "Recalling memories and picking the tier",
  writing: "Model writing the answer",
  tools: "Tools running",
  retrying: "Answer rejected, text reset",
  ready: "Answer ready",
  saving: "Saving the exchange",
  done: "Done sent, memory learns in the background",
  refused503: "Refused: 503 ai_unavailable",
  refused404: "Refused: 404 conversation_not_found",
  refused422: "Refused: 422 input_too_long",
  failed: "Failed: error event, nothing saved",
};
export const state = (v: any) => labels[v.phase];

const groups: Record<string, string> = {
  reading: "Prepare", checking: "Prepare",
  recall: "Recall",
  writing: "Run", tools: "Run", retrying: "Run", ready: "Run",
  saving: "Save", done: "Save",
  refused503: "Stopped", refused404: "Stopped", refused422: "Stopped", failed: "Stopped",
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
  Saved: "the exchange is saved",
  Done: null,
};
export const step = (action: string) => steps[action] ?? null;
