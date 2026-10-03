import { Easing, interpolate } from 'remotion';

export type Pt = { x: number; y: number };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Eased interpolation clamped at both ends.
export const ease = (
  frame: number,
  input: [number, number],
  output: [number, number],
  easing: (t: number) => number = Easing.inOut(Easing.cubic),
) => interpolate(frame, input, output, { ...clamp, easing });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

// Piecewise eased path through keyframes: [[frame, value], ...].
export const keys = (frame: number, kf: [number, number][]) => {
  if (frame <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    if (frame <= kf[i][0]) {
      return ease(frame, [kf[i - 1][0], kf[i][0]], [kf[i - 1][1], kf[i][1]]);
    }
  }
  return kf[kf.length - 1][1];
};

export const keysPt = (frame: number, kf: [number, Pt][]): Pt => ({
  x: keys(frame, kf.map(([f, p]) => [f, p.x])),
  y: keys(frame, kf.map(([f, p]) => [f, p.y])),
});

// Deterministic pseudo-random in [0, 1).
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Smooth, deterministic camera shake for a subtle handheld feel.
export const handheld = (frame: number, amount = 4, seed = 1) => ({
  x:
    amount *
    (Math.sin(frame * 0.071 + seed) * 0.6 + Math.sin(frame * 0.033 + seed * 2.3) * 0.4),
  y:
    amount *
    (Math.sin(frame * 0.057 + seed * 1.7) * 0.6 + Math.sin(frame * 0.029 + seed * 0.4) * 0.4),
  r: amount * 0.05 * Math.sin(frame * 0.041 + seed),
});

// Two-bone IK. Returns the elbow and the (reach-clamped) hand position.
// Elbows hang downward; when the hand is raised above the shoulder they bend outward.
export const solveArm = (shoulder: Pt, target: Pt, upper: number, fore: number, centerX: number) => {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const d = Math.max(Math.abs(upper - fore) + 0.5, Math.min(Math.hypot(dx, dy), upper + fore - 0.5));
  const th = Math.atan2(dy, dx);
  const al = Math.acos((upper * upper + d * d - fore * fore) / (2 * upper * d));
  const e1 = { x: shoulder.x + upper * Math.cos(th + al), y: shoulder.y + upper * Math.sin(th + al) };
  const e2 = { x: shoulder.x + upper * Math.cos(th - al), y: shoulder.y + upper * Math.sin(th - al) };
  const raised = target.y < shoulder.y - 40;
  const elbow = raised
    ? Math.abs(e1.x - centerX) >= Math.abs(e2.x - centerX) ? e1 : e2
    : e1.y >= e2.y ? e1 : e2;
  const hand = { x: shoulder.x + d * Math.cos(th), y: shoulder.y + d * Math.sin(th) };
  return { elbow, hand };
};

// Illegible handwriting: looping cursive-like strokes split into "words".
// Each word is a trochoid with varying loop height, so no real letters appear.
export const scribbleWords = (x0: number, y0: number, width: number, seed: number, size = 1): Pt[][] => {
  const words: Pt[][] = [];
  let x = x0;
  let w = 0;
  while (x < x0 + width - 20 * size) {
    const len = Math.min((40 + rand(seed * 11 + w) * 80) * size, x0 + width - x);
    const pts: Pt[] = [];
    const a = 2.9 * size;
    const b = 3.4 * size;
    for (let t = 0; a * t < len; t += 0.25) {
      const letter = Math.floor(t / (Math.PI * 2));
      const r = rand(seed * 5 + w * 17 + letter);
      // flat strokes, small loops, tall loops and descenders in irregular order
      const h = r < 0.25 ? 0.25 : r < 0.6 ? 0.9 : r < 0.85 ? 2.4 : -1.8;
      const wobble = Math.sin(t * 1.7 + seed) * 0.35 * size;
      pts.push({
        x: x + a * t - b * Math.sin(t) * (0.6 + 0.6 * rand(letter + seed)) + Math.cos(t) * h * 0.9 * size,
        y: y0 - b * (1 - Math.cos(t)) * 0.5 * h + wobble,
      });
    }
    words.push(pts);
    x += len + 16 * size;
    w++;
  }
  return words;
};

export const scribblePath = (words: Pt[][]) => words.map(polyline).join(' ');

export const polyline = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
