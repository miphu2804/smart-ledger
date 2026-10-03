import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Lan, toLocal } from '../art/Lan';
import { P } from '../art/palette';
import { Counter, PhoneBack, Shelf } from '../art/Props';
import { Stage } from '../art/Scene';
import { ease, handheld, keys, keysPt } from '../art/util';

// S5 | frames 630-779 | Bright morning: she picks up her phone from the counter and looks
// at it with curiosity. Only the back of the phone is ever visible.
const ORIGIN = { x: 290, y: 520 };
const S = 1.2;
const PHONE_ON_COUNTER = { x: 760, y: 1452 };

export const S5Morning: React.FC = () => {
  const f = useCurrentFrame();
  const shake = handheld(f, 3, 21);

  const hand = keysPt(f, [
    [0, { x: 820, y: 1560 }],
    [26, { x: PHONE_ON_COUNTER.x + 10, y: PHONE_ON_COUNTER.y - 10 }],
    [36, { x: PHONE_ON_COUNTER.x + 10, y: PHONE_ON_COUNTER.y - 10 }],
    [74, { x: 650, y: 1250 }],
    [150, { x: 646, y: 1244 }],
  ]);
  const held = f >= 34;
  const lift = ease(f, [34, 74], [0, 1]);

  return (
    <Stage camera={{ x: 540 + shake.x, y: 990 + shake.y, scale: keys(f, [[0, 1], [149, 1.05]]), r: shake.r }} background={P.cream}>
      <defs>
        <linearGradient id="s5-sun" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#FFF4DC" stopOpacity={0.7} />
          <stop offset="0.5" stopColor="#FFF4DC" stopOpacity={0.1} />
          <stop offset="1" stopColor="#FFF4DC" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect x={-300} y={-300} width={1700} height={2600} fill="#EEE5D3" />
      <g filter="url(#blur-sm)">
        <Shelf x={-40} y={140} w={1160} h={1000} boards={6} seed={7} />
      </g>
      {/* morning sun rays from the open shutter on the left */}
      <path d="M -300 -100 L 200 -100 L 1400 1700 L 700 1700 Z" fill="#FFF7E6" opacity={0.28} />
      <path d="M -300 400 L -60 400 L 900 1900 L 500 1900 Z" fill="#FFF7E6" opacity={0.2} />

      <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
        <Lan
          hands={{ l: { x: 170, y: 900 }, r: toLocal(hand, ORIGIN, S) }}
          look={{ x: keys(f, [[0, 0.6], [40, 0.6], [80, 0.75]]), y: keys(f, [[0, 1], [40, 1], [80, 0.75]]) }}
          browRaise={keys(f, [[0, 0], [70, 0], [96, 0.8]])}
          smile={keys(f, [[0, 0.2], [90, 0.2], [120, 0.42]])}
          faceTurn={keys(f, [[0, 0.25], [70, 0.25], [100, 0.1]])}
          headTilt={keys(f, [[0, 2], [80, 2], [104, 7]])}
          breath={Math.sin(f / 16)}
          renderItem={(side, h, _a, layer) =>
            side === 'r' && held && layer === 'over' ? (
              <PhoneBack x={h.x - 4} y={h.y - 40 * lift - 6} w={62 / S * 1.1} h={128 / S * 1.1} rot={-10 + 10 * lift} />
            ) : null
          }
        />
      </g>

      <Counter x={-60} y={1480} w={1200} h={520} />
      <path d="M 250 1478 L 470 1478 L 486 1510 L 234 1510 Z" fill="#E9DFC9" />
      <line x1={360} y1={1478} x2={360} y2={1510} stroke="#BFAE90" strokeWidth={3} />
      {!held && (
        <g>
          <ellipse cx={PHONE_ON_COUNTER.x} cy={PHONE_ON_COUNTER.y + 22} rx={70} ry={10} fill="#000" opacity={0.18} />
          <path d={`M ${PHONE_ON_COUNTER.x - 58} ${PHONE_ON_COUNTER.y + 6} L ${PHONE_ON_COUNTER.x + 58} ${PHONE_ON_COUNTER.y + 6} L ${PHONE_ON_COUNTER.x + 66} ${PHONE_ON_COUNTER.y + 22} L ${PHONE_ON_COUNTER.x - 66} ${PHONE_ON_COUNTER.y + 22} Z`} fill={P.phone} />
        </g>
      )}
      <rect x={-300} y={-300} width={1700} height={2600} fill="url(#s5-sun)" />
    </Stage>
  );
};
