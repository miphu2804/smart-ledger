import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Lan, toLocal } from '../art/Lan';
import { P } from '../art/palette';
import { DeskLamp, Shelf } from '../art/Props';
import { Stage } from '../art/Scene';
import { ease, handheld } from '../art/util';

// S4a | frames 450-539 | Night, wide: shutter half down, one warm desk lamp, she counts.
const OPEN = { x: 120, y: 440, w: 840, bottom: 1760 };
const SHUTTER_EDGE = 930;
const ORIGIN = { x: 305, y: 930 };
const S = 0.85;
const LAMP_GLOW = { x: 300, y: 1200 };

// Calculator key presses, in frames relative to the shot (shared with the sound design).
export const S4A_TAPS = [10, 17, 23, 35, 42, 53, 60, 67, 79, 86];

const tapDepth = (f: number) =>
  S4A_TAPS.reduce((acc, t) => Math.max(acc, f >= t - 3 && f <= t + 2 ? 1 - Math.abs(f - t) / 3 : 0), 0);

export const S4aNight: React.FC = () => {
  const f = useCurrentFrame();
  const shake = handheld(f, 2, 13);
  const press = tapDepth(f);
  const calc = { x: 760, y: 1392 };
  const book = { x: 470, y: 1398 };

  return (
    <Stage
      camera={{ x: 540 + shake.x, y: 1060 + shake.y, scale: ease(f, [0, 89], [1.0, 1.03]), r: shake.r }}
      background={P.night}
      defs={
        <>
          <radialGradient id="s4a-glow" gradientUnits="userSpaceOnUse" cx={LAMP_GLOW.x} cy={LAMP_GLOW.y} r={620}>
            <stop offset="0" stopColor={P.lamp} stopOpacity={0.6} />
            <stop offset="0.45" stopColor="#F2A75A" stopOpacity={0.22} />
            <stop offset="1" stopColor="#F2A75A" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="s4a-dark" gradientUnits="userSpaceOnUse" cx={LAMP_GLOW.x + 160} cy={LAMP_GLOW.y + 80} r={560}>
            <stop offset="0" stopColor="#000" />
            <stop offset="1" stopColor="#fff" />
          </radialGradient>
          <mask id="s4a-mask" maskUnits="userSpaceOnUse" x={-400} y={-400} width={2000} height={2800}>
            <rect x={-400} y={-400} width={2000} height={2800} fill="url(#s4a-dark)" />
          </mask>
          <clipPath id="s4a-open">
            <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} />
          </clipPath>
        </>
      }
    >
      <rect x={-300} y={-300} width={1700} height={2600} fill="#1C1D22" />
      <rect x={-300} y={230} width={1700} height={1600} fill="#2B2A2A" />
      {[60, 300, 560, 820].map((x) => (
        <rect key={x} x={x} y={150} width={180} height={150} fill="#232327" />
      ))}
      <rect x={560} y={170} width={140} height={110} fill="#5A4A33" opacity={0.6} />
      <rect x={OPEN.x - 30} y={OPEN.y - 66} width={OPEN.w + 60} height={70} rx={8} fill="#3E403F" />

      <g clipPath="url(#s4a-open)">
        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} fill="#4A3F31" />
        <g filter="url(#blur-sm)" opacity={0.75}>
          <Shelf x={150} y={560} w={780} h={820} boards={5} seed={4} />
        </g>
        <rect x={OPEN.x} y={1600} width={OPEN.w} height={200} fill="#5B4B37" />

        <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
          <Lan
            hands={{
              l: toLocal({ x: book.x - 10, y: book.y - 6 }, ORIGIN, S),
              r: toLocal({ x: calc.x - 6, y: calc.y - 34 + press * 12 }, ORIGIN, S),
            }}
            look={{ x: 0.3, y: 1 }}
            eyesClosed={0.45}
            smile={0}
            browRaise={-0.4}
            headTilt={4}
            breath={Math.sin(f / 20)}
          />
        </g>

        {/* counter seen slightly from above, with the open notebook and calculator */}
        <path d={`M 230 1360 L 930 1360 L 960 1420 L 200 1420 Z`} fill="#8E6440" />
        <rect x={200} y={1420} width={760} height={360} fill="#6E4B2E" />
        <path d={`M ${book.x - 120} 1372 L ${book.x + 120} 1372 L ${book.x + 136} 1408 L ${book.x - 136} 1408 Z`} fill="#E9DFC9" />
        <line x1={book.x} y1={1372} x2={book.x} y2={1408} stroke="#BFAE90" strokeWidth={3} />
        <path d={`M ${calc.x - 40} 1378 L ${calc.x + 40} 1378 L ${calc.x + 46} 1404 L ${calc.x - 46} 1404 Z`} fill="#3C3E40" />
        <DeskLamp x={300} y={1384} s={0.8} />

        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} fill="#0E0C09" opacity={0.62} mask="url(#s4a-mask)" />
        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.bottom - OPEN.y} fill="url(#s4a-glow)" />

        {/* shutter, half down */}
        <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={SHUTTER_EDGE - OPEN.y} fill="#4E5250" />
        {Array.from({ length: Math.ceil((SHUTTER_EDGE - OPEN.y) / 24) }).map((_, i) => (
          <rect key={i} x={OPEN.x} y={SHUTTER_EDGE - 24 * (i + 1)} width={OPEN.w} height={5} fill="#3F4341" />
        ))}
        <rect x={OPEN.x} y={SHUTTER_EDGE - 20} width={OPEN.w} height={20} fill="#3A3D3B" />
        <rect x={OPEN.x} y={SHUTTER_EDGE - 20} width={OPEN.w} height={4} fill="#8A6A45" opacity={0.6} />
      </g>
      <rect x={OPEN.x - 22} y={OPEN.y - 4} width={22} height={OPEN.bottom - OPEN.y + 4} fill="#3A3836" />
      <rect x={OPEN.x + OPEN.w} y={OPEN.y - 4} width={22} height={OPEN.bottom - OPEN.y + 4} fill="#3A3836" />
      <rect x={-300} y={OPEN.bottom} width={1700} height={400} fill="#2F2D2A" />
      <rect x={OPEN.x} y={OPEN.bottom} width={OPEN.w} height={160} fill={P.lamp} opacity={0.06} />
    </Stage>
  );
};
