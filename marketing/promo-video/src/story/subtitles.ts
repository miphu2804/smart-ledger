import lines from './vo-lines.json';

// Voice-over lines. vo-lines.json is shared with scripts/make-vo.py and
// scripts/export-srt.mjs so the copy lives in one place.
export type VoLine = {
  id: string;
  shot: string;
  startFrame: number;
  // Exclusive frame by which the line must have finished (end of its shot slot).
  endFrame: number;
  text: string;
};

export const VO_LINES: readonly VoLine[] = lines;
