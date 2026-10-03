import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Lan } from '../art/Lan';
import { P } from '../art/palette';
import { Stage } from '../art/Scene';
import { handheld, keys, keysPt } from '../art/util';

// S4b | frames 540-629 | Close-up by lamplight: eyes move across the page, a slow exhale,
// she rubs her temple.
const ORIGIN = { x: -240, y: 430 };
const S = 2.6;

export const S4bTired: React.FC = () => {
  const f = useCurrentFrame();
  const shake = handheld(f, 2, 17);

  const lookX = keys(f, [
    [0, -0.8],
    [18, 0.8],
    [21, -0.8],
    [38, 0.8],
    [46, 0.2],
  ]);
  const eyesClosed = keys(f, [
    [0, 0.35],
    [48, 0.35],
    [60, 0.88],
    [80, 0.8],
  ]);
  const shoulderDrop = keys(f, [
    [0, 0],
    [44, -4],
    [64, 12],
  ]);
  const mouthOpen = keys(f, [
    [0, 0],
    [46, 0],
    [54, 0.3],
    [66, 0],
  ]);
  const rub = f > 70 ? { x: Math.cos((f - 70) * 0.45) * 5, y: Math.sin((f - 70) * 0.45) * 4 } : { x: 0, y: 0 };
  const temple = keysPt(f, [
    [0, { x: 470, y: 980 }],
    [52, { x: 470, y: 980 }],
    [72, { x: 374, y: 178 }],
  ]);

  return (
    <Stage
      camera={{ x: 540 + shake.x, y: 960 + shake.y, scale: keys(f, [[0, 1], [89, 1.04]]), r: shake.r }}
      background={P.night}
      defs={
        <>
          <radialGradient id="s4b-lamp" gradientUnits="userSpaceOnUse" cx={900} cy={1300} r={900}>
            <stop offset="0" stopColor={P.lamp} stopOpacity={0.5} />
            <stop offset="0.5" stopColor="#E9934A" stopOpacity={0.16} />
            <stop offset="1" stopColor="#E9934A" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="s4b-shadow" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0.35" stopColor="#0B0907" stopOpacity={0} />
            <stop offset="1" stopColor="#0B0907" stopOpacity={0.62} />
          </linearGradient>
        </>
      }
    >
      <rect x={-300} y={-300} width={1700} height={2600} fill="#1D1914" />
      <g filter="url(#blur-lg)">
        <circle cx={160} cy={420} r={70} fill="#6B5232" opacity={0.5} />
        <circle cx={920} cy={360} r={50} fill="#7A5D38" opacity={0.4} />
        <rect x={-100} y={300} width={1300} height={900} fill="#2A231B" opacity={0.6} />
      </g>
      <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S})`}>
        <Lan
          hands={{ l: { x: 160, y: 1000 }, r: { x: temple.x + rub.x, y: temple.y + rub.y } }}
          handOverHead="r"
          look={{ x: lookX, y: 0.9 }}
          eyesClosed={eyesClosed}
          mouthOpen={mouthOpen}
          smile={-0.15}
          browRaise={-0.6}
          shoulderDrop={shoulderDrop}
          headTilt={keys(f, [[0, 3], [56, 3], [76, 8]])}
          breath={Math.sin(f / 22)}
        />
      </g>
      <rect x={-300} y={-300} width={1700} height={2600} fill="url(#s4b-shadow)" />
      <rect x={-300} y={-300} width={1700} height={2600} fill="url(#s4b-lamp)" />
    </Stage>
  );
};
