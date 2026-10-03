import React from 'react';
import { Easing, useCurrentFrame } from 'remotion';
import { Lan, toLocal } from '../art/Lan';
import { P } from '../art/palette';
import { Motorbike, PaperNote, Shelf } from '../art/Props';
import { Stage } from '../art/Scene';
import { ease, handheld, keys, keysPt, rand } from '../art/util';

// S3 | frames 300-449 | She sticks one more note onto a shelf edge already covered with
// notes, pauses, then turns back to the street with a polite smile.
const ORIGIN = { x: 470, y: 640 };
const S = 1.1;
const NEW_NOTE = { x: 432, y: 1168 };
const LIPS = [770, 1150];

const notes = LIPS.flatMap((ly, row) =>
  Array.from({ length: 7 }).map((_, i) => ({
    x: -40 + i * 82 + rand(i + row * 9) * 14,
    y: ly + 18,
    rot: (rand(i * 3 + row) - 0.5) * 12,
    seed: i + row * 10,
    c: rand(i * 5 + row) > 0.55 ? P.paper : P.paperNote,
  })),
).filter((n) => !(n.y > 1100 && Math.abs(n.x - NEW_NOTE.x) < 60));

export const S3Notes: React.FC = () => {
  const f = useCurrentFrame();
  const shake = handheld(f, 3, 9);

  const hand = keysPt(f, [
    [0, { x: 720, y: 1290 }],
    [28, { x: NEW_NOTE.x + 6, y: NEW_NOTE.y + 26 }],
    [36, { x: NEW_NOTE.x + 2, y: NEW_NOTE.y + 18 }],
    [57, { x: NEW_NOTE.x + 2, y: NEW_NOTE.y + 18 }],
    [84, { x: 640, y: 1420 }],
    [150, { x: 650, y: 1430 }],
  ]);
  const stuck = f >= 34;
  const zoom = keys(f, [
    [0, 2.3],
    [58, 2.3],
    [124, 1.0],
  ]);
  const cx = keys(f, [
    [0, 440],
    [58, 440],
    [124, 560],
  ]);
  const cy = keys(f, [
    [0, 1150],
    [58, 1150],
    [124, 1010],
  ]);
  const faceTurn = keys(f, [
    [0, -0.7],
    [80, -0.7],
    [104, 0.55],
  ]);
  const smile = keys(f, [
    [0, 0.15],
    [86, 0.15],
    [110, 0.6],
  ]);
  const look = { x: keys(f, [[0, -1], [80, -1], [104, 0.9]]), y: keys(f, [[0, 0.6], [80, 0.6], [104, 0]]) };
  const bikeX = ease(f, [92, 140], [1500, 820], (t) => t);

  return (
    <Stage camera={{ x: cx + shake.x, y: cy + shake.y, scale: zoom, r: shake.r }} background={P.wall}>
      <rect x={-400} y={-200} width={1900} height={2400} fill={P.wall} />
      {/* bright doorway to the street on the right */}
      <rect x={960} y={300} width={500} height={1700} fill="#FBF0DC" />
      <g filter="url(#blur-lg)">
        <rect x={980} y={1500} width={480} height={500} fill="#D9CDB6" />
        <g opacity={0.7}>
          <Motorbike x={bikeX} y={1560} s={0.8} c="#7C8790" flip />
        </g>
      </g>
      <rect x={940} y={300} width={30} height={1700} fill="#C9B79A" />

      <g filter="url(#blur-xs)">
        <Shelf x={-120} y={260} w={700} h={1000} boards={4} seed={12} />
      </g>
      {LIPS.map((ly) => (
        <g key={ly}>
          <rect x={-130} y={ly - 8} width={720} height={30} fill={P.metal} />
          <rect x={-130} y={ly + 16} width={720} height={6} fill={P.metalDark} />
        </g>
      ))}
      {notes.map((n) => (
        <PaperNote key={n.seed} x={n.x} y={n.y} w={74} h={64} rot={n.rot} seed={n.seed} c={n.c} />
      ))}
      {stuck && <PaperNote x={NEW_NOTE.x} y={NEW_NOTE.y} w={74} h={64} rot={-4} seed={77} />}

      <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
        <Lan
          hands={{ l: toLocal(hand, ORIGIN, S), r: { x: 430, y: 760 } }}
          faceTurn={faceTurn}
          smile={smile}
          look={look}
          headTilt={keys(f, [[0, -4], [80, -4], [104, 2]])}
          breath={Math.sin(f / 16)}
          renderItem={(side, h, _a, layer) =>
            side === 'l' && layer === 'under' && !stuck ? (
              <PaperNote x={h.x - 26} y={h.y - 30} w={74 / S} h={64 / S} rot={-8} seed={77} />
            ) : null
          }
        />
      </g>
      <rect
        x={-400}
        y={-200}
        width={1900}
        height={2400}
        fill="#FFF1D6"
        opacity={ease(f, [60, 124], [0.02, 0.1], Easing.inOut(Easing.sin))}
      />
    </Stage>
  );
};
