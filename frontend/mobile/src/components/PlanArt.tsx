import React, { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { font } from '../theme';

/**
 * Hình minh hoạ các gói dịch vụ, vẽ bằng SVG theo bảng màu của icon 3D sẵn có (tím #482AAC, vàng logo #FFDA22):
 * nền ô bo tròn sáng, khối chính tô chuyển màu và một vệt sáng để trông bóng như các icon PNG ở tab Quản lý.
 * Vẽ trong code thay vì file ảnh vì công cụ tạo ảnh AI của Canva bị tắt với nhóm.
 */

export type PlanArtKind = 'free' | 'month' | 'quarter' | 'premium';

const PURPLE_TOP = '#A28BFF';
const PURPLE_BOTTOM = '#5634C9';
const YELLOW_TOP = '#FFE97A';
const YELLOW_BOTTOM = '#FFC21A';

function Tile({ id }: { id: string }) {
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#ECE5FF" />
        </LinearGradient>
        <LinearGradient id={`${id}-purple`} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={PURPLE_TOP} />
          <Stop offset="1" stopColor={PURPLE_BOTTOM} />
        </LinearGradient>
        <LinearGradient id={`${id}-yellow`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={YELLOW_TOP} />
          <Stop offset="1" stopColor={YELLOW_BOTTOM} />
        </LinearGradient>
        <LinearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E9E2FF" />
        </LinearGradient>
      </Defs>
      <Rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-tile)`} stroke="#E2D9FF" strokeWidth="1.2" />
    </>
  );
}

/** Ngôi sao bốn cánh nhỏ như ở icon Trợ lý */
function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const k = r * 0.28;
  return <Path d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r}Z`} fill={fill} />;
}

function Calendar({ id, x, y, w, h, label, opacity = 1 }: { id: string; x: number; y: number; w: number; h: number; label?: string; opacity?: number }) {
  const head = h * 0.3;
  return (
    <G opacity={opacity}>
      <Rect x={x} y={y} width={w} height={h} rx={6} fill={`url(#${id}-paper)`} stroke="#D6CBFF" strokeWidth="1" />
      <Path d={`M${x} ${y + 6} Q${x} ${y} ${x + 6} ${y} L${x + w - 6} ${y} Q${x + w} ${y} ${x + w} ${y + 6} L${x + w} ${y + head} L${x} ${y + head}Z`} fill={`url(#${id}-purple)`} />
      <Rect x={x + w * 0.24} y={y - 3} width="4" height="8" rx="2" fill={`url(#${id}-yellow)`} />
      <Rect x={x + w * 0.76 - 4} y={y - 3} width="4" height="8" rx="2" fill={`url(#${id}-yellow)`} />
      {label ? (
        <SvgText x={x + w / 2} y={y + head + (h - head) * 0.78} fontSize={(h - head) * 0.78} fontFamily={font.extrabold} fill={PURPLE_BOTTOM} textAnchor="middle">
          {label}
        </SvgText>
      ) : null}
      <Ellipse cx={x + w * 0.32} cy={y + head * 0.4} rx={w * 0.22} ry={head * 0.18} fill="#FFFFFF" opacity="0.35" />
    </G>
  );
}

/**
 * ID gradient riêng cho mỗi hình: trên web các màn cũ trong stack vẫn nằm trong DOM (ẩn), và `url(#id)` trỏ tới phần tử
 * đầu tiên có ID đó, nên ID trùng làm hình ở màn sau mất màu.
 */
function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function PlanArt({ kind, size = 48 }: { kind: PlanArtKind; size?: number }) {
  const id = useSvgId(`plan-${kind}`);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Tile id={id} />
      {kind === 'free' ? (
        <G>
          <Path d="M14 22 Q14 15 21 15 L43 15 Q50 15 50 22 L50 35 Q50 42 43 42 L28 42 L20 49 L21 42 Q14 42 14 35Z" fill={`url(#${id}-purple)`} />
          <Ellipse cx="25" cy="20" rx="8" ry="2.6" fill="#FFFFFF" opacity="0.35" />
          <Circle cx="24" cy="29" r="3" fill="#FFFFFF" />
          <Circle cx="32" cy="29" r="3" fill="#FFFFFF" />
          <Circle cx="40" cy="29" r="3" fill="#FFFFFF" />
          <Sparkle x={50} y={14} r={6} fill={`url(#${id}-yellow)`} />
        </G>
      ) : null}
      {kind === 'month' ? (
        <G>
          <Calendar id={id} x={15} y={15} w={34} h={34} label="1" />
          <Sparkle x={51} y={14} r={5.5} fill={`url(#${id}-yellow)`} />
        </G>
      ) : null}
      {kind === 'quarter' ? (
        <G>
          <Calendar id={id} x={22} y={11} w={28} h={28} opacity={0.55} />
          <Calendar id={id} x={18} y={15} w={30} h={30} opacity={0.8} />
          <Calendar id={id} x={13} y={20} w={32} h={32} label="3" />
          <Circle cx="48" cy="46" r="8" fill={`url(#${id}-yellow)`} stroke="#FFFFFF" strokeWidth="1.5" />
          <Path d="M48 41.5 L49.4 44.6 L52.6 44.9 L50.2 47 L50.9 50.2 L48 48.5 L45.1 50.2 L45.8 47 L43.4 44.9 L46.6 44.6Z" fill="#FFFFFF" />
        </G>
      ) : null}
      {kind === 'premium' ? (
        <G>
          <Path d="M20 22 L26 14 L38 14 L44 22 L32 50Z" fill={`url(#${id}-purple)`} />
          <Path d="M20 22 L44 22 L32 50Z" fill="#3F23A8" opacity="0.35" />
          <Path d="M26 14 L32 22 L38 14Z" fill="#FFFFFF" opacity="0.3" />
          <Path d="M20 22 L26 14 L28 22Z" fill="#FFFFFF" opacity="0.18" />
          <Path d="M28 22 L32 50 L24 26Z" fill="#FFFFFF" opacity="0.22" />
          <Sparkle x={47} y={15} r={6} fill={`url(#${id}-yellow)`} />
          <Sparkle x={15} y={40} r={4} fill={`url(#${id}-yellow)`} />
        </G>
      ) : null}
    </Svg>
  );
}

/** Hình của từng gói theo mã Core; gói lạ dùng hình lịch. */
export function planArtKind(planCode: string, durationMonths: number | null): PlanArtKind {
  if (planCode === 'FREE' || durationMonths === null) return 'free';
  return durationMonths >= 3 ? 'quarter' : 'month';
}

/** Hoạ tiết nền cho phần đầu màn mua gói: vài khối bóng và ngôi sao, đặt sau ảnh Bobi. */
export function PlanHeroDecor({ width, height }: { width: number; height: number }) {
  const id = useSvgId('hero');
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id={`${id}-blob`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#CBBDFF" stopOpacity="0.8" />
          <Stop offset="1" stopColor="#8C6CFF" stopOpacity="0.15" />
        </LinearGradient>
        <LinearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={YELLOW_TOP} stopOpacity="0.9" />
          <Stop offset="1" stopColor={YELLOW_BOTTOM} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Circle cx={width * 0.06} cy={height * 0.2} r={height * 0.32} fill={`url(#${id}-blob)`} />
      <Circle cx={width * 0.95} cy={height * 0.9} r={height * 0.28} fill={`url(#${id}-blob)`} />
      <Circle cx={width * 0.83} cy={height * 0.18} r={height * 0.12} fill={`url(#${id}-sun)`} />
      <Sparkle x={width * 0.62} y={height * 0.2} r={7} fill="#FFFFFF" />
      <Sparkle x={width * 0.12} y={height * 0.72} r={5} fill="#FFFFFF" />
    </Svg>
  );
}
