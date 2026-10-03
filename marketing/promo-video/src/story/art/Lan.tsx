import React from 'react';
import { P } from './palette';
import { Pt, solveArm } from './util';

// "Cô Lan": fictional shop owner, about 45. Same character sheet in every shot:
// warm tan skin, shoulder-length black hair in a low ponytail, small gold stud
// earrings, plain sage-green short-sleeve t-shirt, beige apron with one front pocket.
// Local canvas: 600 wide, head centre (300, 215), shoulders at y 405, torso to y 1100.

export type Side = 'l' | 'r';
export type ItemLayer = 'under' | 'over';

export type LanProps = {
  view?: 'front' | 'back';
  // Hand targets in local coordinates. 'l' is the arm on the viewer's left.
  hands: Record<Side, Pt>;
  smile?: number;
  eyesClosed?: number;
  look?: Pt;
  mouthOpen?: number;
  browRaise?: number;
  faceTurn?: number;
  headTilt?: number;
  shoulderDrop?: number;
  breath?: number;
  // Draw this arm after the head (e.g. hand on temple).
  handOverHead?: Side | null;
  renderItem?: (side: Side, hand: Pt, angle: number, layer: ItemLayer) => React.ReactNode;
};

const UPPER = 168;
const FORE = 152;

const Hand: React.FC<{ at: Pt; angle: number; flip: boolean }> = ({ at, angle, flip }) => {
  const deg = (angle * 180) / Math.PI;
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${deg - 90})`}>
      <ellipse cx={0} cy={14} rx={25} ry={31} fill={P.skin} />
      <ellipse cx={flip ? -21 : 21} cy={2} rx={9} ry={19} fill={P.skin} transform={`rotate(${flip ? 28 : -28})`} />
      <path d="M -12 30 L -12 40 M 0 33 L 0 44 M 12 30 L 12 40" stroke={P.skinShade} strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
      <path d="M -16 4 Q 0 12 16 4" stroke={P.skinShade} strokeWidth={2} fill="none" opacity={0.35} />
    </g>
  );
};

const Arm: React.FC<{
  side: Side;
  shoulder: Pt;
  target: Pt;
  renderItem?: LanProps['renderItem'];
}> = ({ side, shoulder, target, renderItem }) => {
  const { elbow, hand } = solveArm(shoulder, target, UPPER, FORE, 300);
  const fa = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
  const ua = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x);
  const n = { x: -Math.sin(ua), y: Math.cos(ua) };
  const m = { x: shoulder.x + (elbow.x - shoulder.x) * 0.55, y: shoulder.y + (elbow.y - shoulder.y) * 0.55 };
  const sleeve = [
    { x: shoulder.x + n.x * 37, y: shoulder.y + n.y * 37 },
    { x: m.x + n.x * 33, y: m.y + n.y * 33 },
    { x: m.x - n.x * 33, y: m.y - n.y * 33 },
    { x: shoulder.x - n.x * 37, y: shoulder.y - n.y * 37 },
  ];
  return (
    <g>
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${elbow.x} ${elbow.y} L ${hand.x} ${hand.y}`}
        stroke={P.skin}
        strokeWidth={42}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d={`M ${elbow.x} ${elbow.y} L ${hand.x} ${hand.y}`}
        stroke={P.skinShade}
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.18}
        transform="translate(4 6)"
      />
      <circle cx={shoulder.x} cy={shoulder.y} r={37} fill={P.shirt} />
      <polygon points={sleeve.map((p) => `${p.x},${p.y}`).join(' ')} fill={P.shirt} />
      <line x1={sleeve[1].x} y1={sleeve[1].y} x2={sleeve[2].x} y2={sleeve[2].y} stroke={P.shirtShade} strokeWidth={4} strokeLinecap="round" />
      {renderItem?.(side, hand, fa, 'under')}
      <Hand at={hand} angle={fa} flip={side === 'r'} />
      {renderItem?.(side, hand, fa, 'over')}
    </g>
  );
};

const FrontHead: React.FC<Required<Pick<LanProps, 'smile' | 'eyesClosed' | 'look' | 'mouthOpen' | 'browRaise' | 'faceTurn'>>> = ({
  smile,
  eyesClosed,
  look,
  mouthOpen,
  browRaise,
  faceTurn,
}) => {
  const fx = faceTurn * 16;
  const eyeY = 224;
  const open = 1 - Math.min(1, Math.max(0, eyesClosed));
  const brow = 193 - browRaise * 7;
  const corner = 287 - smile * 7;
  const mid = 288 + smile * 8;
  const eye = (cx: number) => (
    <g>
      {open > 0.15 ? (
        <>
          <ellipse cx={cx} cy={eyeY} rx={13} ry={8.5 * open} fill="#F4ECE2" />
          <ellipse cx={cx + look.x * 4} cy={eyeY + look.y * 2.5} rx={7.5} ry={7.5 * open} fill="#2A201B" />
          <path
            d={`M ${cx - 14} ${eyeY - 1} Q ${cx} ${eyeY - 12 * open - 1} ${cx + 14} ${eyeY - 1}`}
            stroke={P.hair}
            strokeWidth={3.6}
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path d={`M ${cx - 13} ${eyeY} Q ${cx} ${eyeY + 6} ${cx + 13} ${eyeY}`} stroke={P.hair} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      )}
      <path d={`M ${cx - 10} ${eyeY + 13} Q ${cx} ${eyeY + 17} ${cx + 10} ${eyeY + 13}`} stroke={P.skinShade} strokeWidth={1.8} fill="none" opacity={0.45} />
    </g>
  );
  return (
    <g>
      {/* hair mass behind the head, including the gathered low ponytail */}
      <ellipse cx={300 + fx * 0.3} cy={200} rx={92} ry={102} fill={P.hair} />
      <path d="M 222 230 Q 218 305 254 316 L 346 316 Q 382 305 378 230 Z" fill={P.hair} />
      <ellipse cx={221 + fx * 0.4} cy={234} rx={14} ry={24} fill={P.skinShade} />
      <ellipse cx={379 + fx * 0.4} cy={234} rx={14} ry={24} fill={P.skinShade} />
      <circle cx={221 + fx * 0.4} cy={256} r={5.5} fill={P.gold} />
      <circle cx={379 + fx * 0.4} cy={256} r={5.5} fill={P.gold} />
      <circle cx={219.5 + fx * 0.4} cy={254.5} r={1.8} fill="#FFF1C4" />
      <circle cx={377.5 + fx * 0.4} cy={254.5} r={1.8} fill="#FFF1C4" />
      <ellipse cx={300} cy={217} rx={80} ry={97} fill={P.skin} />
      <ellipse cx={300 - fx * 1.6} cy={217} rx={80} ry={97} fill={P.skinShade} opacity={Math.abs(faceTurn) * 0.12} />
      <g transform={`translate(${fx} 0)`}>
        <ellipse cx={256} cy={266} rx={18} ry={11} fill="#D97A63" opacity={0.18 + smile * 0.08} />
        <ellipse cx={344} cy={266} rx={18} ry={11} fill="#D97A63" opacity={0.18 + smile * 0.08} />
        <path d={`M 250 ${brow + 2} Q 266 ${brow - 7} 284 ${brow}`} stroke={P.hair} strokeWidth={5} fill="none" strokeLinecap="round" />
        <path d={`M 316 ${brow} Q 334 ${brow - 7} 350 ${brow + 2}`} stroke={P.hair} strokeWidth={5} fill="none" strokeLinecap="round" />
        {eye(266)}
        {eye(334)}
        <path d="M 302 232 Q 296 254 302 263 Q 307 265 311 262" stroke={P.skinShade} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M 262 270 Q 266 285 276 294" stroke={P.skinShade} strokeWidth={2} fill="none" opacity={0.35} />
        <path d="M 338 270 Q 334 285 324 294" stroke={P.skinShade} strokeWidth={2} fill="none" opacity={0.35} />
        {mouthOpen > 0.02 && <ellipse cx={300} cy={mid - 3} rx={12} ry={2 + 6 * mouthOpen} fill="#5C2C24" />}
        <path d={`M 279 ${corner} Q 300 ${mid + 2} 321 ${corner}`} stroke={P.lip} strokeWidth={4.2} fill="none" strokeLinecap="round" />
      </g>
      {/* front hair with a soft side part; ends near the ears */}
      <path
        d={`M 216 236 Q 206 112 300 104 Q 398 104 386 238 Q 380 176 350 150 Q ${318 + fx} 172 ${262 + fx} 158 Q 232 178 216 236 Z`}
        fill={P.hair}
      />
      <path d={`M 250 128 Q 290 112 336 122`} stroke={P.hairShine} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.7} />
    </g>
  );
};

const BackHead: React.FC = () => (
  <g>
    <ellipse cx={217} cy={234} rx={13} ry={22} fill={P.skinShade} />
    <ellipse cx={383} cy={234} rx={13} ry={22} fill={P.skinShade} />
    <circle cx={218} cy={255} r={5} fill={P.gold} />
    <circle cx={382} cy={255} r={5} fill={P.gold} />
    <ellipse cx={300} cy={208} rx={86} ry={101} fill={P.hair} />
    <path d="M 286 296 C 266 340 276 404 300 438 C 324 404 334 340 314 296 Z" fill={P.hair} />
    <rect x={284} y={290} width={32} height={13} rx={6} fill="#6B4A2E" />
    <path d="M 252 140 Q 300 118 348 140" stroke={P.hairShine} strokeWidth={6} fill="none" opacity={0.6} strokeLinecap="round" />
    <path d="M 298 320 Q 294 370 300 420" stroke={P.hairShine} strokeWidth={4} fill="none" opacity={0.5} strokeLinecap="round" />
  </g>
);

export const Lan: React.FC<LanProps> = ({
  view = 'front',
  hands,
  smile = 0.3,
  eyesClosed = 0,
  look = { x: 0, y: 0 },
  mouthOpen = 0,
  browRaise = 0,
  faceTurn = 0,
  headTilt = 0,
  shoulderDrop = 0,
  breath = 0,
  handOverHead = null,
  renderItem,
}) => {
  const sy = 405 + shoulderDrop;
  const shoulders: Record<Side, Pt> = { l: { x: 180, y: sy }, r: { x: 420, y: sy } };
  const arm = (side: Side) => (
    <Arm key={side} side={side} shoulder={shoulders[side]} target={hands[side]} renderItem={renderItem} />
  );
  const bodyScale = 1 + breath * 0.008;
  const torsoFront =
    'M 165 452 C 165 396 200 372 245 366 C 264 394 336 394 355 366 C 400 372 435 396 435 452 L 448 1100 L 152 1100 Z';
  const torsoBack = 'M 165 452 C 165 396 200 372 245 366 Q 300 360 355 366 C 400 372 435 396 435 452 L 448 1100 L 152 1100 Z';

  return (
    <g>
      <g transform={`translate(0 ${shoulderDrop}) translate(300 1100) scale(1 ${bodyScale}) translate(-300 -1100)`}>
        {view === 'front' ? (
          <>
            <path d="M 268 286 L 268 382 Q 300 400 332 382 L 332 286 Z" fill={P.skin} />
            <ellipse cx={300} cy={302} rx={34} ry={12} fill={P.skinShade} opacity={0.5} />
            <path d={torsoFront} fill={P.shirt} />
            <path d="M 245 366 C 264 394 336 394 355 366" stroke={P.shirtShade} strokeWidth={6} fill="none" />
            <path d="M 258 374 L 238 520 M 342 374 L 362 520" stroke={P.apron} strokeWidth={14} strokeLinecap="round" />
            <path
              d="M 232 515 L 368 515 L 374 650 C 400 655 425 660 438 668 L 452 1100 L 148 1100 L 162 668 C 175 660 200 655 226 650 Z"
              fill={P.apron}
            />
            <path d="M 162 668 C 175 660 200 655 226 650 L 374 650 C 400 655 425 660 438 668" stroke={P.apronShade} strokeWidth={5} fill="none" />
            <rect x={240} y={768} width={120} height={92} rx={10} fill={P.apronShade} opacity={0.55} />
            <rect x={244} y={772} width={112} height={84} rx={8} fill="none" stroke={P.apronStitch} strokeWidth={2} strokeDasharray="6 5" />
            <rect x={330} y={748} width={9} height={42} rx={4} fill="#34405A" />
          </>
        ) : (
          <>
            <rect x={270} y={286} width={60} height={96} fill={P.skinShade} />
            <path d={torsoBack} fill={P.shirt} />
            <path d="M 300 380 L 300 1100" stroke={P.shirtShade} strokeWidth={3} opacity={0.35} />
            <path d="M 262 352 Q 300 374 338 352" stroke={P.apron} strokeWidth={12} fill="none" strokeLinecap="round" />
            <path d="M 152 690 L 448 690" stroke={P.apron} strokeWidth={14} />
            <ellipse cx={278} cy={690} rx={24} ry={13} fill={P.apron} stroke={P.apronShade} strokeWidth={3} />
            <ellipse cx={322} cy={690} rx={24} ry={13} fill={P.apron} stroke={P.apronShade} strokeWidth={3} />
            <path d="M 296 696 L 284 760 M 304 696 L 318 756" stroke={P.apron} strokeWidth={11} strokeLinecap="round" />
            <circle cx={300} cy={690} r={9} fill={P.apronShade} />
          </>
        )}
        {(['l', 'r'] as Side[]).filter((s) => s !== handOverHead).map(arm)}
      </g>
      <g transform={`translate(0 ${shoulderDrop * 0.8}) rotate(${headTilt} 300 330)`}>
        {view === 'front' ? (
          <FrontHead smile={smile} eyesClosed={eyesClosed} look={look} mouthOpen={mouthOpen} browRaise={browRaise} faceTurn={faceTurn} />
        ) : (
          <BackHead />
        )}
      </g>
      {handOverHead && <g transform={`translate(0 ${shoulderDrop})`}>{arm(handOverHead)}</g>}
    </g>
  );
};

// Place a local Lan point in scene coordinates for a given transform.
export const toScene = (p: Pt, origin: Pt, scale: number): Pt => ({ x: origin.x + p.x * scale, y: origin.y + p.y * scale });
export const toLocal = (p: Pt, origin: Pt, scale: number): Pt => ({ x: (p.x - origin.x) / scale, y: (p.y - origin.y) / scale });
