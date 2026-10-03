// Shot slots from the Story30 shotlist. Frame ranges are inclusive start, exclusive end.
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 900;

export type ShotId = 'S1' | 'S2a' | 'S2b' | 'S3' | 'S4a' | 'S4b' | 'S5' | 'S6';

export type Shot = {
  id: ShotId;
  title: string;
  from: number;
  durationInFrames: number;
};

export const SHOTS: readonly Shot[] = [
  { id: 'S1', title: 'Dawn, opening the shop', from: 0, durationInFrames: 150 },
  { id: 'S2a', title: 'The rush', from: 150, durationInFrames: 75 },
  { id: 'S2b', title: 'Writing it down', from: 225, durationInFrames: 75 },
  { id: 'S3', title: 'Notes everywhere', from: 300, durationInFrames: 150 },
  { id: 'S4a', title: 'Night, the counting', from: 450, durationInFrames: 90 },
  { id: 'S4b', title: 'Tired', from: 540, durationInFrames: 90 },
  { id: 'S5', title: 'A new morning', from: 630, durationInFrames: 150 },
  { id: 'S6', title: 'Handoff', from: 780, durationInFrames: 120 },
];

// The only dissolve in the film: 6 frames centered on the S4b -> S5 cut.
export const DISSOLVE = { after: 'S4b' as ShotId, frames: 6 };

// The last frames of S6 hold the final pose for the match cut into the app section.
export const HANDOFF_HOLD_FROM = 894;

export const SUPER = {
  text: 'Hôm nay bán được bao nhiêu?',
  from: 470,
  to: 620,
  centerY: 620,
};

export const AI_DISCLOSURE = 'Hình ảnh nhân vật được tạo bằng AI';

export const shotById = (id: ShotId): Shot => {
  const shot = SHOTS.find((s) => s.id === id);
  if (!shot) throw new Error(`Unknown shot ${id}`);
  return shot;
};

const assertTimeline = () => {
  let cursor = 0;
  for (const shot of SHOTS) {
    if (shot.from !== cursor) {
      throw new Error(`Shot ${shot.id} starts at ${shot.from}, expected ${cursor}`);
    }
    cursor += shot.durationInFrames;
  }
  if (cursor !== TOTAL_FRAMES) {
    throw new Error(`Shot slots sum to ${cursor} frames, expected ${TOTAL_FRAMES}`);
  }
};

assertTimeline();
