import React from 'react';
import { P } from './palette';
import { rand, scribblePath, scribbleWords } from './util';

// All props are unbranded: blank labels, no printed text, no logos.

export const Bottle: React.FC<{ x: number; y: number; s?: number; rot?: number }> = ({ x, y, s = 1, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <rect x={-9} y={-112} width={18} height={14} rx={3} fill={P.bottleCap} stroke="#C9D3D6" strokeWidth={2} />
    <path d="M -10 -98 Q -24 -86 -24 -66 L -24 -6 Q -24 4 -14 4 L 14 4 Q 24 4 24 -6 L 24 -66 Q 24 -86 10 -98 Z" fill={P.bottle} opacity={0.92} />
    <rect x={-24} y={-58} width={48} height={26} fill="#F6F8F7" />
    <path d="M -14 -84 L -14 -12" stroke="#FFFFFF" strokeWidth={5} opacity={0.6} strokeLinecap="round" />
  </g>
);

const SnackBag: React.FC<{ x: number; y: number; w: number; h: number; c: string }> = ({ x, y, w, h, c }) => (
  <g>
    <path d={`M ${x} ${y} L ${x + w} ${y} L ${x + w - 4} ${y - h} L ${x + 4} ${y - h} Z`} fill={c} />
    <path
      d={`M ${x + 4} ${y - h} l ${w / 8} -6 l ${w / 8} 6 l ${w / 8} -6 l ${w / 8} 6 l ${w / 8} -6 l ${w / 8} 6 l ${w / 8} -6 l ${w / 8 - 8 / 8} 6`}
      fill={c}
    />
    <ellipse cx={x + w / 2} cy={y - h / 2} rx={w * 0.22} ry={h * 0.18} fill="#FFFFFF" opacity={0.25} />
  </g>
);

const Carton: React.FC<{ x: number; y: number; w: number; h: number }> = ({ x, y, w, h }) => (
  <g>
    <rect x={x} y={y - h} width={w} height={h} fill="#C9A47A" />
    <rect x={x} y={y - h} width={w} height={8} fill="#B89068" />
    <rect x={x + w / 2 - 6} y={y - h} width={12} height={h} fill="#D9BC92" opacity={0.7} />
  </g>
);

const BAG_COLORS = ['#E3C477', '#D9906F', '#9FC19C', '#E8DFCB', '#C7B3D6', '#E7A9A0'];

// Metal shelving unit with plain goods. x,y is the top-left; boards are spaced evenly.
export const Shelf: React.FC<{ x: number; y: number; w: number; h: number; boards?: number; seed?: number }> = ({
  x,
  y,
  w,
  h,
  boards = 5,
  seed = 1,
}) => {
  const gap = h / boards;
  const rows = [];
  for (let b = 0; b < boards; b++) {
    const by = y + gap * (b + 1) - 14;
    const items = [];
    let cx = x + 18;
    let i = 0;
    while (cx < x + w - 150) {
      const r = rand(seed * 31 + b * 13 + i);
      const kind = r < 0.4 ? 'bag' : r < 0.7 ? 'bottle' : 'carton';
      if (kind === 'bag') {
        const bw = 52 + rand(i + b) * 20;
        items.push(<SnackBag key={i} x={cx} y={by} w={bw} h={gap * 0.62} c={BAG_COLORS[Math.floor(rand(seed + i * 3 + b) * BAG_COLORS.length)]} />);
        cx += bw + 6;
      } else if (kind === 'bottle') {
        const n = 2 + Math.floor(rand(i * 7 + b) * 3);
        for (let k = 0; k < n; k++) items.push(<Bottle key={`${i}-${k}`} x={cx + 24 + k * 46} y={by} s={gap / 190} />);
        cx += n * 46 + 8;
      } else {
        const cw = 80 + rand(i + b * 2) * 30;
        items.push(<Carton key={i} x={cx} y={by} w={cw} h={gap * 0.55} />);
        cx += cw + 8;
      }
      i++;
    }
    rows.push(
      <g key={b}>
        {items}
        <rect x={x} y={by} width={w} height={14} fill={P.metal} />
        <rect x={x} y={by + 10} width={w} height={4} fill={P.metalDark} />
      </g>,
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#000" opacity={0.06} />
      {rows}
      <rect x={x - 8} y={y} width={14} height={h + 30} fill={P.metalDark} />
      <rect x={x + w - 6} y={y} width={14} height={h + 30} fill={P.metalDark} />
    </g>
  );
};

export const Counter: React.FC<{ x: number; y: number; w: number; h: number; top?: number }> = ({ x, y, w, h, top = 46 }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} fill={P.wood} />
    {Array.from({ length: Math.ceil(w / 120) }).map((_, i) => (
      <line key={i} x1={x + i * 120} y1={y + top} x2={x + i * 120} y2={y + h} stroke={P.woodDark} strokeWidth={3} opacity={0.4} />
    ))}
    <rect x={x - 14} y={y - 6} width={w + 28} height={top} rx={6} fill={P.woodTop} />
    <rect x={x - 14} y={y + top - 12} width={w + 28} height={8} fill={P.woodDark} opacity={0.35} />
  </g>
);

// Worn paper notebook, open. Handwriting is illegible scribble only.
export const Notebook: React.FC<{ x: number; y: number; w: number; h: number; rows?: number; seed?: number; filled?: number }> = ({
  x,
  y,
  w,
  h,
  rows = 9,
  seed = 3,
  filled = 7,
}) => (
  <g>
    <rect x={x - 6} y={y + 6} width={w + 12} height={h} rx={8} fill="#000" opacity={0.18} />
    <rect x={x} y={y} width={w / 2} height={h} rx={6} fill={P.paper} />
    <rect x={x + w / 2} y={y} width={w / 2} height={h} rx={6} fill="#F6F0E2" />
    <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke="#CDBFA4" strokeWidth={3} />
    {Array.from({ length: rows }).map((_, r) => {
      const ly = y + ((r + 1) * h) / (rows + 1);
      return (
        <g key={r}>
          <line x1={x + 10} y1={ly} x2={x + w - 10} y2={ly} stroke="#B9C9DA" strokeWidth={1.5} opacity={0.6} />
          {r < filled && (
            <path
              d={scribblePath(scribbleWords(x + 18, ly - 9, w / 2 - 40 - rand(seed + r) * 60, seed + r, w / 300))}
              stroke={P.scribble}
              strokeWidth={Math.max(1.4, w / 260)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          )}
          {r < filled - 2 && (
            <path
              d={scribblePath(scribbleWords(x + w / 2 + 18, ly - 9, w / 2 - 50 - rand(seed + r * 5) * 70, seed + r * 9, w / 300))}
              stroke={P.scribble}
              strokeWidth={Math.max(1.4, w / 260)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          )}
        </g>
      );
    })}
  </g>
);

// Basic calculator: blank display, unlabeled keys.
export const Calculator: React.FC<{ x: number; y: number; s?: number; pressed?: number }> = ({ x, y, s = 1, pressed = -1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={0} y={0} width={120} height={170} rx={12} fill="#4A4C4E" />
    <rect x={12} y={12} width={96} height={34} rx={5} fill="#A9B39A" />
    {Array.from({ length: 16 }).map((_, i) => (
      <rect
        key={i}
        x={12 + (i % 4) * 25}
        y={58 + Math.floor(i / 4) * 27}
        width={20}
        height={21}
        rx={4}
        fill={i === pressed ? '#9A9C9E' : i % 4 === 3 ? '#C98D62' : '#D8D6D0'}
      />
    ))}
  </g>
);

// Phone seen from the back only. The screen is never drawn.
export const PhoneBack: React.FC<{ x: number; y: number; w?: number; h?: number; rot?: number }> = ({ x, y, w = 74, h = 152, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} rx={w * 0.22} fill={P.phoneEdge} />
    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w * 0.2} fill={P.phone} />
    <rect x={-w / 2 + w * 0.1} y={-h / 2 + w * 0.1} width={w * 0.42} height={w * 0.42} rx={w * 0.1} fill="#3A3935" />
    <circle cx={-w / 2 + w * 0.22} cy={-h / 2 + w * 0.22} r={w * 0.075} fill="#121110" />
    <circle cx={-w / 2 + w * 0.4} cy={-h / 2 + w * 0.4} r={w * 0.075} fill="#121110" />
    <rect x={-w / 2 + 4} y={-h / 2 + 6} width={4} height={h - 24} rx={2} fill="#FFFFFF" opacity={0.08} />
  </g>
);

export const PaperNote: React.FC<{ x: number; y: number; w?: number; h?: number; rot?: number; seed?: number; c?: string }> = ({
  x,
  y,
  w = 90,
  h = 70,
  rot = 0,
  seed = 1,
  c = P.paperNote,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-w / 2 + 2} y={-4 + 3} width={w} height={h} fill="#000" opacity={0.12} />
    <rect x={-w / 2} y={-4} width={w} height={h} fill={c} />
    <rect x={-14} y={-10} width={28} height={12} fill="#F6F2E6" opacity={0.8} />
    {[0, 1, 2].map((r) => (
      <path
        key={r}
        d={scribblePath(scribbleWords(-w / 2 + 10, 14 + r * 17, w - 22 - rand(seed + r) * 24, seed * 3 + r, w / 140))}
        stroke={P.scribble}
        strokeWidth={1.7}
        fill="none"
        opacity={0.8}
        strokeLinecap="round"
      />
    ))}
  </g>
);

export const Stool: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={0} cy={0} rx={70} ry={20} fill={P.stool} />
    <path d="M -64 4 L -52 110 L 52 110 L 64 4 Z" fill={P.stoolShade} />
    <path d="M -40 30 L -30 100 M 0 30 L 0 104 M 40 30 L 30 100" stroke={P.stool} strokeWidth={8} />
    <ellipse cx={0} cy={-2} rx={52} ry={12} fill="#CF5A4A" opacity={0.6} />
  </g>
);

export const Motorbike: React.FC<{ x: number; y: number; s?: number; c?: string; flip?: boolean }> = ({ x, y, s = 1, c = '#5D6670', flip = false }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <circle cx={-110} cy={0} r={48} fill="#2C2B29" />
    <circle cx={120} cy={0} r={48} fill="#2C2B29" />
    <path d="M -150 -30 Q -120 -100 -20 -96 L 60 -96 Q 120 -90 150 -40 L 120 -30 Z" fill={c} />
    <rect x={-60} y={-130} width={120} height={30} rx={14} fill="#3B3A37" />
    <path d="M 120 -40 L 150 -150" stroke="#3B3A37" strokeWidth={12} />
    <circle cx={-10} cy={-250} r={40} fill="#3C4A57" />
    <path d="M -60 -120 Q -60 -210 -10 -215 Q 40 -210 40 -120 Z" fill="#6F7A84" />
    <path d="M 20 -190 L 130 -160" stroke="#6F7A84" strokeWidth={24} strokeLinecap="round" />
  </g>
);

// Desk lamp with a warm bulb. Glow is drawn by the scene.
export const DeskLamp: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={0} cy={0} rx={60} ry={14} fill="#2E2C29" />
    <path d="M 0 -6 L 40 -170 L -30 -250" stroke="#2E2C29" strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M -30 -250 L -110 -220 L -60 -170 Z" fill="#33312D" />
    <ellipse cx={-82} cy={-192} rx={26} ry={12} fill={P.lamp} transform="rotate(-38 -82 -192)" />
  </g>
);

// Customer seen from behind, out of focus in the foreground.
export const CustomerBack: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M -230 900 L -210 330 C -200 250 -120 215 -40 210 L 40 210 C 120 215 200 250 210 330 L 230 900 Z" fill="#5A6672" />
    <rect x={-40} y={150} width={80} height={80} fill="#9E6E4B" />
    <ellipse cx={0} cy={80} rx={92} ry={108} fill="#24211F" />
    <ellipse cx={-90} cy={95} rx={14} ry={24} fill="#9E6E4B" />
    <ellipse cx={90} cy={95} rx={14} ry={24} fill="#9E6E4B" />
  </g>
);
