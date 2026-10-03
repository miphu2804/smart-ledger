import React from 'react';
import { useCurrentFrame } from 'remotion';
import { P } from '../art/palette';
import { Stage } from '../art/Scene';
import { Pt, ease, handheld, polyline, rand, scribbleWords } from '../art/util';

// S2b | frames 225-299 | Close-up: her hand quickly writes in the paper notebook.
// Handwriting is illegible scribble; shallow focus follows the pen tip.
const LINE_GAP = 96;
const TOP = 560;
const LEFT = 150;
const SIZE = 3.1;
const LINE_A = 5;
const LINE_B = 6;

const flatten = (words: Pt[][]) => words.flatMap((w, wi) => w.map((p, i) => ({ ...p, up: i === 0 && wi > 0 })));

const lineA = flatten(scribbleWords(LEFT, TOP + LINE_A * LINE_GAP - 14, 700, 41, SIZE));
const lineB = flatten(scribbleWords(LEFT, TOP + LINE_B * LINE_GAP - 14, 460, 57, SIZE));

const partial = (pts: (Pt & { up: boolean })[], k: number) => {
  const words: Pt[][] = [];
  pts.slice(0, Math.max(1, Math.floor(k))).forEach((p) => {
    if (p.up || words.length === 0) words.push([]);
    words[words.length - 1].push(p);
  });
  return words.map(polyline).join(' ');
};

const Page: React.FC<{ a: number; b: number }> = ({ a, b }) => (
  <g>
    <rect x={-200} y={300} width={1500} height={1500} fill={P.paper} />
    <rect x={-200} y={300} width={1500} height={40} fill="#E6DCC6" />
    {Array.from({ length: 12 }).map((_, r) => {
      const y = TOP + r * LINE_GAP;
      return (
        <g key={r}>
          <line x1={-200} y1={y} x2={1300} y2={y} stroke="#B9C9DA" strokeWidth={3} opacity={0.55} />
          {r < LINE_A && (
            <path
              d={scribbleWords(LEFT, y - 14, 520 + rand(r + 2) * 260, 13 + r * 7, SIZE).map(polyline).join(' ')}
              stroke={P.scribble}
              strokeWidth={4.2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          )}
        </g>
      );
    })}
    <line x1={110} y1={300} x2={110} y2={1800} stroke="#D9A6A0" strokeWidth={3} opacity={0.6} />
    <path d={partial(lineA, a)} stroke={P.scribble} strokeWidth={4.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {b > 0 && <path d={partial(lineB, b)} stroke={P.scribble} strokeWidth={4.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
  </g>
);

const HandWithPen: React.FC<{ tip: Pt; wiggle: number }> = ({ tip, wiggle }) => {
  const dir = { x: 0.42, y: 0.91 };
  const along = (d: number) => ({ x: tip.x + dir.x * d, y: tip.y + dir.y * d });
  const pen0 = along(0);
  const pen1 = along(300);
  const grip = along(150);
  return (
    <g>
      {/* soft shadow on the page */}
      <g transform="translate(34 46)" opacity={0.16} filter="url(#blur-md)">
        <ellipse cx={grip.x + 70} cy={grip.y + 60} rx={150} ry={110} fill="#000" />
        <path d={`M ${pen0.x} ${pen0.y} L ${pen1.x} ${pen1.y}`} stroke="#000" strokeWidth={14} />
      </g>
      {/* forearm toward the bottom-right corner */}
      <path d={`M ${grip.x + 110} ${grip.y + 80} L ${grip.x + 560} ${grip.y + 780}`} stroke={P.skin} strokeWidth={150} strokeLinecap="round" />
      <path d={`M ${grip.x + 170} ${grip.y + 170} L ${grip.x + 560} ${grip.y + 780}`} stroke={P.skinShade} strokeWidth={30} opacity={0.16} />
      {/* back of the hand, curled fingers under the pen */}
      <g transform={`translate(${grip.x} ${grip.y}) rotate(${-28 + wiggle * 3})`}>
        <ellipse cx={86} cy={44} rx={112} ry={84} fill={P.skin} />
        <ellipse cx={20} cy={70} rx={46} ry={26} fill={P.skinShade} opacity={0.9} />
        <ellipse cx={46} cy={92} rx={40} ry={22} fill={P.skinShade} opacity={0.8} />
        <ellipse cx={-6} cy={46} rx={44} ry={24} fill={P.skin} />
      </g>
      {/* pen */}
      <path d={`M ${pen0.x} ${pen0.y} L ${along(26).x} ${along(26).y}`} stroke="#C9CDD0" strokeWidth={12} strokeLinecap="round" />
      <path d={`M ${along(26).x} ${along(26).y} L ${pen1.x} ${pen1.y}`} stroke="#34405A" strokeWidth={20} strokeLinecap="round" />
      {/* index finger along the pen and the thumb on its side */}
      <path d={`M ${along(52).x} ${along(52).y} Q ${along(110).x + 40} ${along(110).y - 30} ${along(170).x + 70} ${along(170).y - 10}`} stroke={P.skin} strokeWidth={38} strokeLinecap="round" fill="none" />
      <ellipse cx={along(56).x + 2} cy={along(56).y - 2} rx={10} ry={8} fill="#E7B79B" opacity={0.85} />
      <path d={`M ${along(70).x - 18} ${along(70).y + 6} Q ${along(120).x - 40} ${along(120).y + 20} ${along(170).x} ${along(170).y + 40}`} stroke={P.skinLight} strokeWidth={36} strokeLinecap="round" fill="none" />
      <path d={`M ${along(110).x + 30} ${along(110).y - 22} Q ${along(140).x + 50} ${along(140).y - 24} ${along(170).x + 70} ${along(170).y - 10}`} stroke={P.skinShade} strokeWidth={3} fill="none" opacity={0.45} />
    </g>
  );
};

export const S2bWriting: React.FC = () => {
  const f = useCurrentFrame();
  const a = ease(f, [0, 40], [1, lineA.length], (t) => t);
  const b = ease(f, [47, 74], [0, lineB.length], (t) => t);
  const pts = f < 47 ? lineA : lineB;
  const k = Math.min(pts.length - 1, Math.floor(f < 47 ? a : Math.max(1, b)));
  let tip: Pt = pts[k];
  if (f >= 40 && f < 47) {
    const t = ease(f, [40, 47], [0, 1]);
    const from = lineA[lineA.length - 1];
    const to = lineB[0];
    tip = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 30 };
  }
  const shake = handheld(f, 3, 5);
  const focus = { x: tip.x, y: tip.y };

  return (
    <Stage
      camera={{ x: 520 + shake.x + (tip.x - 520) * 0.15, y: 1080 + shake.y, scale: 1.04, r: -7 + shake.r }}
      background={P.paper}
      defs={
        <>
          <radialGradient id="s2b-focus" gradientUnits="userSpaceOnUse" cx={focus.x} cy={focus.y} r={520}>
            <stop offset="0.35" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          <mask id="s2b-mask" maskUnits="userSpaceOnUse" x={-400} y={-400} width={2000} height={2800}>
            <rect x={-400} y={-400} width={2000} height={2800} fill="url(#s2b-focus)" />
          </mask>
        </>
      }
    >
      <g filter="url(#blur-md)">
        <Page a={a} b={b} />
      </g>
      <g mask="url(#s2b-mask)">
        <Page a={a} b={b} />
      </g>
      <HandWithPen tip={tip} wiggle={Math.sin(f * 1.3)} />
      <rect x={-400} y={-400} width={2000} height={2800} fill="#FFE9C8" opacity={0.1} />
    </Stage>
  );
};
