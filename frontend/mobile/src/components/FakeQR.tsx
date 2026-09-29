import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '../theme';

/** Mã QR GIẢ (chỉ để minh hoạ UI chuyển khoản) — không quét được. */
export function FakeQR({ seed, size = 160 }: { seed: string; size?: number }) {
  const n = 25;
  const cell = size / n;
  const cells: React.ReactNode[] = [];
  // PRNG mulberry32 — tạo hoa văn trông giống QR
  let t = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      if (rand() < 0.48) {
        cells.push(<Rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={colors.ink} />);
      }
    }
  }
  const eye = (x: number, y: number) => (
    <React.Fragment key={`e${x}${y}`}>
      <Rect x={x * cell} y={y * cell} width={7 * cell} height={7 * cell} fill={colors.ink} rx={cell} />
      <Rect x={(x + 1) * cell} y={(y + 1) * cell} width={5 * cell} height={5 * cell} fill="#fff" rx={cell * 0.6} />
      <Rect x={(x + 2) * cell} y={(y + 2) * cell} width={3 * cell} height={3 * cell} fill={colors.accentInk} rx={cell * 0.5} />
    </React.Fragment>
  );
  return (
    <Svg width={size} height={size}>
      <Rect width={size} height={size} fill="#fff" />
      {cells}
      {eye(0, 0)}
      {eye(n - 7, 0)}
      {eye(0, n - 7)}
    </Svg>
  );
}
