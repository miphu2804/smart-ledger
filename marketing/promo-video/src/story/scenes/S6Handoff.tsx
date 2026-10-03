import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Lan, toLocal } from '../art/Lan';
import { P } from '../art/palette';
import { PhoneBack, Shelf } from '../art/Props';
import { Stage } from '../art/Scene';
import { handheld, keys, keysPt } from '../art/util';
import { HANDOFF_HOLD_FROM, shotById } from '../timeline';

// S6 | frames 780-899 | Medium close-up: she raises the phone to chest height and speaks to
// it with a small confident smile. The phone ends near frame centre, screen facing away.
// The last usable frame is held from frame 894 for the match cut into the app section.
const ORIGIN = { x: 15, y: 184 };
const S = 1.75;
const HOLD = HANDOFF_HOLD_FROM - shotById('S6').from - 1;

// Final phone geometry in frame coordinates (used by the handoff report).
export const HANDOFF_PHONE = { cx: 540, cy: 985, w: 118, h: 242, tiltDeg: 0 };

export const S6Handoff: React.FC = () => {
  const f = Math.min(useCurrentFrame(), HOLD);
  const shake = handheld(f, 2.5 * Math.max(0, 1 - f / 100), 25);

  const hand = keysPt(f, [
    [0, { x: 650, y: 1330 }],
    [40, { x: HANDOFF_PHONE.cx + 6, y: HANDOFF_PHONE.cy + 92 }],
    [HOLD, { x: HANDOFF_PHONE.cx + 6, y: HANDOFF_PHONE.cy + 92 }],
  ]);
  const phoneRot = keys(f, [
    [0, -8],
    [40, 0],
  ]);
  // She speaks naturally after the voice-over line, not in sync with it.
  const talking = f > 52 && f < 90 ? Math.max(0, Math.sin((f - 52) * 0.7)) * 0.35 : 0;

  return (
    <Stage camera={{ x: 540 + shake.x, y: 960 + shake.y, scale: keys(f, [[0, 1], [HOLD, 1.04]]) }} background={P.cream}>
      <rect x={-300} y={-300} width={1700} height={2600} fill="#ECE3D0" />
      <g filter="url(#blur-md)">
        <Shelf x={-80} y={60} w={1240} h={1300} boards={6} seed={9} />
      </g>
      <path d="M -300 -100 L 260 -100 L 1400 1500 L 800 1500 Z" fill="#FFF7E6" opacity={0.3} />

      <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
        <Lan
          hands={{ l: { x: 150, y: 980 }, r: toLocal(hand, ORIGIN, S) }}
          look={{ x: 0, y: keys(f, [[0, 0.4], [40, 0.9]]) }}
          smile={keys(f, [[0, 0.35], [40, 0.55], [96, 0.7]])}
          mouthOpen={talking}
          browRaise={0.2}
          headTilt={keys(f, [[0, 0], [60, -3]])}
          breath={Math.sin(f / 18)}
        />
      </g>
      <PhoneBack
        x={keys(f, [[0, 644], [40, HANDOFF_PHONE.cx]])}
        y={keys(f, [[0, 1238], [40, HANDOFF_PHONE.cy]])}
        w={HANDOFF_PHONE.w}
        h={HANDOFF_PHONE.h}
        rot={phoneRot}
      />
      {/* fingers wrapped around the phone edges */}
      <g transform={`translate(${hand.x - 6} ${hand.y - 92}) rotate(${phoneRot})`}>
        <ellipse cx={-64} cy={20} rx={14} ry={22} fill={P.skin} />
        <ellipse cx={-64} cy={62} rx={14} ry={22} fill={P.skin} />
        <ellipse cx={64} cy={30} rx={13} ry={30} fill={P.skin} />
      </g>
    </Stage>
  );
};
