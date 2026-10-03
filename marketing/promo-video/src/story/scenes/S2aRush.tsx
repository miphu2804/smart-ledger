import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Lan, toLocal } from '../art/Lan';
import { P } from '../art/palette';
import { Bottle, Counter, CustomerBack, Shelf } from '../art/Props';
import { Stage } from '../art/Scene';
import { ease, handheld, keysPt, lerp } from '../art/util';

// S2a | frames 150-224 | Medium shot: she hands two bottles to a customer (back to camera).
const ORIGIN = { x: 330, y: 560 };
const S = 1.15;

export const S2aRush: React.FC = () => {
  const f = useCurrentFrame();
  const shake = handheld(f, 5, 2);

  // Both hands carry the bottles across the counter toward the customer, then return.
  const giveL = keysPt(f, [
    [0, { x: 640, y: 1330 }],
    [34, { x: 470, y: 1300 }],
    [48, { x: 470, y: 1300 }],
    [72, { x: 600, y: 1420 }],
  ]);
  const giveR = keysPt(f, [
    [0, { x: 740, y: 1330 }],
    [34, { x: 560, y: 1300 }],
    [48, { x: 560, y: 1300 }],
    [72, { x: 760, y: 1420 }],
  ]);
  const handed = f >= 44;
  const custReach = keysPt(f, [
    [0, { x: 120, y: 1700 }],
    [30, { x: 380, y: 1330 }],
    [44, { x: 430, y: 1310 }],
    [74, { x: 200, y: 1600 }],
  ]);
  const bottlesAt = handed ? { x: custReach.x + 70, y: custReach.y } : { x: (giveL.x + giveR.x) / 2, y: giveL.y };

  return (
    <Stage camera={{ x: 540 + shake.x, y: 960 + shake.y, scale: 1, r: shake.r }} background={P.wall}>
      <rect x={-100} y={-100} width={1280} height={2200} fill={P.wall} />
      <g filter="url(#blur-sm)">
        <Shelf x={-40} y={120} w={1160} h={1020} boards={6} seed={7} />
      </g>
      <rect x={-100} y={-100} width={1280} height={2200} fill="#FFE7C2" opacity={0.12} />

      <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
        <Lan
          hands={{ l: toLocal(giveL, ORIGIN, S), r: toLocal(giveR, ORIGIN, S) }}
          smile={0.65}
          look={{ x: -0.8, y: 0.4 }}
          faceTurn={-0.35}
          headTilt={-3}
          breath={Math.sin(f / 15)}
        />
      </g>

      <Counter x={-60} y={1380} w={1200} h={600} />

      {/* the two bottles, carried between the hands, then taken by the customer */}
      <Bottle x={bottlesAt.x - 26} y={bottlesAt.y + 40} s={1.15} rot={handed ? -6 : 4} />
      <Bottle x={bottlesAt.x + 30} y={bottlesAt.y + 44} s={1.15} rot={handed ? -2 : 8} />

      {/* customer: foreground, back to camera, out of focus */}
      <g filter="url(#blur-md)">
        <path
          d={`M 60 1640 Q ${lerp(140, custReach.x - 60, 0.6)} ${custReach.y + 80} ${custReach.x} ${custReach.y + 30}`}
          stroke="#9E6E4B"
          strokeWidth={56}
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx={custReach.x + 20} cy={custReach.y + 26} rx={30} ry={36} fill="#9E6E4B" />
        <CustomerBack x={90} y={1180} s={1.35} />
      </g>
      <rect x={-100} y={-100} width={1280} height={2200} fill="#FFF3DD" opacity={ease(f, [0, 74], [0.04, 0.08])} />
    </Stage>
  );
};
