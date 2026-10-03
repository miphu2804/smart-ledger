import React from 'react';
import { Easing, useCurrentFrame } from 'remotion';
import { Lan, toLocal } from '../art/Lan';
import { P } from '../art/palette';
import { Counter, Motorbike, Shelf, Stool } from '../art/Props';
import { Stage } from '../art/Scene';
import { ease, keys, lerp } from '../art/util';

// S1 | frames 0-149 | Dawn: from the street, she pushes up the metal shutter.
const OPEN = { x: 120, y: 440, w: 840, bottom: 1760 };
const ORIGIN = { x: 135, y: 720 };
const S = 1.35;
// Hands grip the bottom bar wide, outside the head silhouette.
const GRIP_L = 360;
const GRIP_R = 720;
// The shot opens with the shutter already lifted to head height, mid-push.
const START_EDGE = 1120;

export const S1Dawn: React.FC = () => {
  const f = useCurrentFrame();

  // Shutter bottom edge: pushed from head height to overhead, then it rolls up on its own.
  const pushed = keys(f, [
    [0, START_EDGE],
    [10, START_EDGE - 14],
    [70, 860],
  ]);
  const edge = f < 70 ? pushed : ease(f, [70, 100], [860, OPEN.y + 6], Easing.out(Easing.cubic));
  const open = (START_EDGE - edge) / (START_EDGE - OPEN.y);

  const grip = (x: number) => toLocal({ x, y: edge + 12 }, ORIGIN, S);
  const release = ease(f, [70, 108], [0, 1]);
  const rest = { l: { x: 186, y: 712 }, r: { x: 414, y: 712 } };
  const lift = { l: grip(GRIP_L), r: grip(GRIP_R) };
  const hands = f < 70
    ? lift
    : {
        l: { x: lerp(grip(GRIP_L).x, rest.l.x, release), y: lerp(toLocal({ x: 0, y: 872 }, ORIGIN, S).y, rest.l.y, release) },
        r: { x: lerp(grip(GRIP_R).x, rest.r.x, release), y: lerp(toLocal({ x: 0, y: 872 }, ORIGIN, S).y, rest.r.y, release) },
      };

  const bikeX = ease(f, [106, 142], [-520, 1620], (t) => t);
  const camera = { x: 540, y: 1010, scale: ease(f, [0, 149], [1, 1.07], Easing.inOut(Easing.sin)) };
  const sun = ease(f, [30, 130], [0, 1]);

  return (
    <Stage
      camera={camera}
      background={P.dawnSky}
      defs={
        <>
          <linearGradient id="s1-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={P.dawnSkyHigh} />
            <stop offset="1" stopColor={P.dawnSky} />
          </linearGradient>
          <linearGradient id="s1-sun" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFD9A0" stopOpacity={0.75} />
            <stop offset="0.6" stopColor="#FFC98A" stopOpacity={0.12} />
            <stop offset="1" stopColor="#FFC98A" stopOpacity={0} />
          </linearGradient>
          <radialGradient id="s1-spill" cx="0.5" cy="1" r="0.8">
            <stop offset="0" stopColor="#FFD39A" stopOpacity={0.55} />
            <stop offset="1" stopColor="#FFD39A" stopOpacity={0} />
          </radialGradient>
          <clipPath id="s1-open">
            <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} />
          </clipPath>
        </>
      }
    >
      <rect x={-200} y={-200} width={1480} height={480} fill="url(#s1-sky)" />
      {/* facade */}
      <rect x={-200} y={230} width={1480} height={1600} fill="#E2D2B6" />
      <rect x={-200} y={230} width={1480} height={26} fill="#CDBB9C" />
      <rect x={-200} y={300} width={1480} height={14} fill="#B8A688" />
      {[60, 300, 560, 820].map((x) => (
        <g key={x}>
          <rect x={x} y={150} width={180} height={150} fill="#CBB797" />
          <ellipse cx={x + 90} cy={292} rx={80} ry={26} fill="#7E9A72" />
          <ellipse cx={x + 50} cy={280} rx={40} ry={20} fill="#90AE84" />
        </g>
      ))}
      <rect x={OPEN.x - 30} y={OPEN.y - 66} width={OPEN.w + 60} height={70} rx={8} fill={P.shutterRidge} />
      <rect x={OPEN.x - 30} y={OPEN.y - 66} width={OPEN.w + 60} height={14} rx={6} fill={P.shutterLight} />

      {/* interior behind the shutter */}
      <g clipPath="url(#s1-open)">
        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} fill={P.wall} />
        <g filter="url(#blur-xs)">
          <Shelf x={170} y={520} w={520} h={900} boards={6} seed={4} />
          <Counter x={720} y={1240} w={260} h={520} />
          <rect x={OPEN.x} y={1560} width={OPEN.w} height={200} fill={P.floor} />
        </g>
        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} fill={P.ink} opacity={lerp(0.7, 0.18, open)} />
        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} fill="url(#s1-spill)" opacity={open} />
        {/* roll-up shutter */}
        <g>
          <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={edge - OPEN.y} fill={P.shutter} />
          {Array.from({ length: Math.ceil((edge - OPEN.y) / 24) }).map((_, i) => (
            <rect key={i} x={OPEN.x} y={edge - 24 * (i + 1)} width={OPEN.w} height={5} fill={P.shutterRidge} />
          ))}
          <rect x={OPEN.x} y={edge - 20} width={OPEN.w} height={20} fill={P.metalDark} />
          <rect x={500} y={edge - 14} width={80} height={10} rx={5} fill="#5F625F" />
        </g>
      </g>
      <rect x={OPEN.x - 22} y={OPEN.y - 4} width={22} height={OPEN.bottom - OPEN.y + 4} fill="#BCA889" />
      <rect x={OPEN.x + OPEN.w} y={OPEN.y - 4} width={22} height={OPEN.bottom - OPEN.y + 4} fill="#BCA889" />

      {/* sidewalk */}
      <rect x={-200} y={OPEN.bottom} width={1480} height={400} fill="#D3C7B2" />
      {[-100, 60, 220, 380, 540, 700, 860, 1020, 1180].map((x) => (
        <line key={x} x1={x} y1={OPEN.bottom} x2={x - 60} y2={2200} stroke="#BFB29B" strokeWidth={3} />
      ))}
      <Stool x={70} y={1700} s={0.9} />
      <Stool x={1010} y={1700} s={0.9} />

      {/* low sun across the facade */}
      <rect x={-200} y={-200} width={1480} height={2400} fill="url(#s1-sun)" opacity={0.35 + sun * 0.45} />

      <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
        <Lan view="back" hands={hands} headTilt={f < 70 ? -2 : 0} breath={Math.sin(f / 18)} />
      </g>

      {/* a motorbike passes, out of focus, between camera and shop */}
      <g filter="url(#motion)" opacity={0.85}>
        <Motorbike x={bikeX} y={2080} s={1.9} c="#6C7680" />
      </g>
    </Stage>
  );
};
