import { S4A_TAPS } from './scenes/S4aNight';
import { shotById } from './timeline';

// Ambience and Foley cues in absolute frames. Files come from scripts/make-sfx.sh.
export type Cue = { file: string; from: number; duration: number; volume: number; loop?: boolean; fadeOut?: number };

const s4a = shotById('S4a').from;

export const SFX: Cue[] = [
  // S1 dawn: room tone, birds, shutter rattle synced to the push, a passing bike
  { file: 'room-tone', from: 0, duration: 900, volume: 0.5, loop: true },
  { file: 'birds', from: 0, duration: 150, volume: 1.6, loop: true, fadeOut: 12 },
  { file: 'motorbike', from: 4, duration: 130, volume: 0.25 },
  { file: 'shutter', from: 8, duration: 108, volume: 0.75 },
  { file: 'motorbike', from: 70, duration: 132, volume: 0.6 },
  // S2 the rush
  { file: 'motorbike', from: 150, duration: 132, volume: 0.2 },
  { file: 'pen', from: 226, duration: 74, volume: 0.55 },
  // S3 notes
  { file: 'paper-tap', from: 300 + 33, duration: 8, volume: 0.6 },
  { file: 'motorbike', from: 300 + 70, duration: 132, volume: 0.3 },
  // S4 night
  { file: 'crickets', from: 450, duration: 180, volume: 1.0, loop: true, fadeOut: 8 },
  ...S4A_TAPS.map((t) => ({ file: 'calc-click', from: s4a + t, duration: 3, volume: 0.35 })),
  // S5-S6 morning
  { file: 'birds', from: 630, duration: 270, volume: 1.1, loop: true, fadeOut: 20 },
  { file: 'motorbike', from: 640, duration: 132, volume: 0.22 },
];
