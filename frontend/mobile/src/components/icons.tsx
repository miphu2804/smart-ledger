import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

export type TabIconName = 'home' | 'receipt' | 'box' | 'grid';
export type TabIconVariant = 'outline' | 'filled';

export interface TabIconProps {
  name: TabIconName;
  variant?: TabIconVariant;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Unified Tab Icon family for Bottom Navigation.
 * - Geometric, rounded, minimal, clear silhouette.
 * - Exact paired geometry: INACTIVE outline (lighter weight, stroke ~2.2) vs ACTIVE solid/filled (stronger weight).
 * - Optical weight balanced across all 4 tab icons.
 */
export function TabIcon({
  name,
  variant = 'outline',
  size = 24,
  color = '#78746B',
  style,
}: TabIconProps) {
  const isFilled = variant === 'filled';

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {name === 'home' && (
          isFilled ? (
            /* Solid home with clean negative-space door cutout */
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.23 2.65a1.2 1.2 0 011.54 0l7.8 6.5A1.2 1.2 0 0119.8 11h-.8v8.2a1.8 1.8 0 01-1.8 1.8h-2.8a1 1 0 01-1-1v-4.2a1.4 1.4 0 00-1.4-1.4h-0a1.4 1.4 0 00-1.4 1.4V20a1 1 0 01-1 1H6.8A1.8 1.8 0 015 19.2V11h-.8a1.2 1.2 0 01-.77-1.85l7.8-6.5z"
              fill={color}
            />
          ) : (
            /* Outline home: roof + rounded walls + door arch */
            <>
              <Path
                d="M3.5 10.2L12 3.5l8.5 6.7"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M5.5 9.2V19.4c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6V9.2"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M10 21v-4.5a2 2 0 014 0V21"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )
        )}

        {name === 'receipt' && (
          isFilled ? (
            /* Solid receipt with clean negative-space lines */
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.5 5.2A2.7 2.7 0 017.2 2.5h9.6a2.7 2.7 0 012.7 2.7v13.6a2.7 2.7 0 01-2.7 2.7H7.2a2.7 2.7 0 01-2.7-2.7V5.2zM8.2 7a1 1 0 000 2h7.6a1 1 0 100-2H8.2zm0 4a1 1 0 100 2h7.6a1 1 0 100-2H8.2zm0 4a1 1 0 100 2h4.6a1 1 0 100-2H8.2z"
              fill={color}
            />
          ) : (
            /* Outline receipt: sheet + 3 clean lines */
            <>
              <Rect
                x="4.5"
                y="3"
                width="15"
                height="18"
                rx="2.5"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M8.5 8h7M8.5 12h7M8.5 16h4.5"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )
        )}

        {name === 'box' && (
          isFilled ? (
            /* Solid goods/package box with clean flap seam cutout */
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.5 7.5A2.7 2.7 0 017.2 4.8h9.6a2.7 2.7 0 012.7 2.7V9h-15V7.5zm0 3.2h6.5v2.8a1 1 0 002 0v-2.8h6.5v6.8a2.7 2.7 0 01-2.7 2.7H7.2a2.7 2.7 0 01-2.7-2.7v-6.8z"
              fill={color}
            />
          ) : (
            /* Outline goods/package box: rounded rect + flap line + center tape tick */
            <>
              <Rect
                x="4.5"
                y="4.8"
                width="15"
                height="15.2"
                rx="2.5"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M4.5 10h15M12 10v4"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )
        )}

        {name === 'grid' && (
          isFilled ? (
            /* Solid 2x2 control grid */
            <>
              <Rect x="4" y="4" width="6.8" height="6.8" rx="2.2" fill={color} />
              <Rect x="13.2" y="4" width="6.8" height="6.8" rx="2.2" fill={color} />
              <Rect x="4" y="13.2" width="6.8" height="6.8" rx="2.2" fill={color} />
              <Rect x="13.2" y="13.2" width="6.8" height="6.8" rx="2.2" fill={color} />
            </>
          ) : (
            /* Outline 2x2 control grid */
            <>
              <Rect
                x="4.2"
                y="4.2"
                width="6.6"
                height="6.6"
                rx="2"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Rect
                x="13.2"
                y="4.2"
                width="6.6"
                height="6.6"
                rx="2"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Rect
                x="4.2"
                y="13.2"
                width="6.6"
                height="6.6"
                rx="2"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Rect
                x="13.2"
                y="13.2"
                width="6.6"
                height="6.6"
                rx="2"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )
        )}
      </Svg>
    </View>
  );
}

export type ActionIconName = 'mic' | 'scan' | 'cart' | 'assistant' | 'chevron' | 'bell';

export interface ActionIconProps {
  name: ActionIconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Functional Action Icons for "Đơn hàng mới" and quick actions.
 * - 3D White-to-grey metallic gradient rendering.
 * - Fine, sharp stroke geometry (strokeWidth 1.4 - 1.6) with multi-plane depth facets.
 * - True AI Neural Core / Isometric Processor (not customer support headset).
 */
export function ActionIcon({ name, size = 25, color = '#FFFFFF', style }: ActionIconProps) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
          <SvgLinearGradient id="actGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="50%" stopColor="#E2E5E9" stopOpacity={1} />
            <Stop offset="100%" stopColor="#9AA0A8" stopOpacity={1} />
          </SvgLinearGradient>
          <SvgLinearGradient id="actGradMid" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#D5D9DF" stopOpacity={1} />
            <Stop offset="55%" stopColor="#8A919C" stopOpacity={1} />
            <Stop offset="100%" stopColor="#525862" stopOpacity={1} />
          </SvgLinearGradient>
          <SvgLinearGradient id="actGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#7E8590" stopOpacity={1} />
            <Stop offset="100%" stopColor="#3C4148" stopOpacity={1} />
          </SvgLinearGradient>
          <SvgLinearGradient id="actGradSurfLight" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.25} />
            <Stop offset="100%" stopColor="#9AA0A8" stopOpacity={0.05} />
          </SvgLinearGradient>
          <SvgLinearGradient id="actGradSurfDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#525862" stopOpacity={0.25} />
            <Stop offset="100%" stopColor="#1E2024" stopOpacity={0.08} />
          </SvgLinearGradient>
          <SvgLinearGradient id="actLaser" x1="0%" y1="50%" x2="100%" y2="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.15} />
            <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.15} />
          </SvgLinearGradient>
        </Defs>

        {name === 'mic' && (
          <>
            {/* 3D Capsule microphone with specular highlight and metallic base */}
            <Rect
              x="8.5"
              y="3"
              width="7"
              height="10.5"
              rx="3.5"
              stroke="url(#actGradLight)"
              strokeWidth={1.5}
              fill="url(#actGradSurfLight)"
            />
            {/* Specular highlight along left edge for 3D cylindrical volume */}
            <Path
              d="M10 5.2v6.2"
              stroke="#FFFFFF"
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.9}
            />
            {/* Split grill seam */}
            <Path
              d="M8.5 8h7"
              stroke="url(#actGradMid)"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
            {/* Shock mount cradle with metallic gradient */}
            <Path
              d="M5.5 10.5a6.5 6.5 0 0013 0"
              stroke="url(#actGradMid)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Center stem */}
            <Path
              d="M12 17v3.5"
              stroke="url(#actGradLight)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            {/* 3D beveled base plate */}
            <Path
              d="M8 20.5h8"
              stroke="url(#actGradLight)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <Path
              d="M7 21.8h10"
              stroke="url(#actGradDark)"
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.7}
            />
          </>
        )}

        {name === 'cart' && (
          <>
            {/* 3D Isometric goods cart / basket */}
            <Path
              d="M3 4h2.2l.6 2.5"
              stroke="url(#actGradLight)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Basket wireframe with top rim highlight */}
            <Path
              d="M5.8 6.5h14.4l-1.8 7.5H8.2L5.8 6.5z"
              stroke="url(#actGradLight)"
              strokeWidth={1.5}
              fill="url(#actGradSurfLight)"
              strokeLinejoin="round"
            />
            {/* Basket inner horizontal & vertical depth wires */}
            <Path
              d="M6.8 10h12.2"
              stroke="url(#actGradMid)"
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.7}
            />
            <Path
              d="M10.2 6.5l.8 7.5M14.8 6.5l-.8 7.5"
              stroke="url(#actGradMid)"
              strokeWidth={1.1}
              strokeLinecap="round"
              opacity={0.5}
            />
            {/* Chassis legs */}
            <Path
              d="M8.5 14v3.5M16.5 14v3.5"
              stroke="url(#actGradDark)"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
            {/* 3D Metallic Wheels with specular center hub */}
            <Circle cx="8.5" cy="19.2" r="1.8" stroke="url(#actGradLight)" strokeWidth={1.4} />
            <Circle cx="8.5" cy="19.2" r="0.7" fill="#FFFFFF" />
            <Circle cx="16.5" cy="19.2" r="1.8" stroke="url(#actGradLight)" strokeWidth={1.4} />
            <Circle cx="16.5" cy="19.2" r="0.7" fill="#FFFFFF" />
          </>
        )}

        {name === 'scan' && (
          <>
            {/* 3D Optical Barcode / Scanner Viewfinder */}
            <Path
              d="M4 8V5A1 1 0 015 4h3"
              stroke="url(#actGradLight)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M16 4h3a1 1 0 011 1v3"
              stroke="url(#actGradLight)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M4 16v3a1 1 0 001 1h3"
              stroke="url(#actGradMid)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M16 20h3a1 1 0 001-1v-3"
              stroke="url(#actGradDark)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 3D Metallic barcode vertical bars */}
            <Rect x="7.5" y="7.5" width="1.6" height="9" rx="0.8" fill="url(#actGradLight)" />
            <Rect x="10.8" y="8.5" width="1.2" height="7" rx="0.6" fill="url(#actGradMid)" />
            <Rect x="13.5" y="7.5" width="2" height="9" rx="0.8" fill="url(#actGradLight)" />
            <Rect x="17" y="8.5" width="1.2" height="7" rx="0.6" fill="url(#actGradDark)" />
            {/* Sharp 3D laser scan beam */}
            <Path
              d="M3 12h18"
              stroke="url(#actLaser)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <Circle cx="12" cy="12" r="1.2" fill="#FFFFFF" />
          </>
        )}

        {name === 'assistant' && (
          <>
            {/* 3D Isometric AI Neural Core / Intelligence Processor */}
            <Polygon
              points="12,2.8 19.5,7.2 19.5,16.5 12,21 4.5,16.5 4.5,7.2"
              stroke="url(#actGradLight)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            {/* Top illuminated isometric plane */}
            <Polygon
              points="12,2.8 19.5,7.2 12,11.5 4.5,7.2"
              fill="url(#actGradSurfLight)"
              stroke="url(#actGradLight)"
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
            {/* Left mid-tone isometric plane */}
            <Polygon
              points="4.5,7.2 12,11.5 12,21 4.5,16.5"
              fill="url(#actGradSurfDark)"
              stroke="url(#actGradMid)"
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
            {/* Right shadow-tone isometric plane */}
            <Polygon
              points="12,11.5 19.5,7.2 19.5,16.5 12,21"
              stroke="url(#actGradDark)"
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
            {/* Central 4-pointed AI Neural Star / Intelligence Core */}
            <Path
              d="M12 7.2c0 2 1.6 3.2 3.2 3.2-1.6 0-3.2 1.2-3.2 3.2 0-2-1.6-3.2-3.2-3.2 1.6 0 3.2-1.2 3.2-3.2z"
              fill="#FFFFFF"
              stroke="url(#actGradLight)"
              strokeWidth={0.8}
            />
            {/* External high-tech circuit pins */}
            <Path
              d="M12 1.5V2.8M19.5 7.2l1.6-.9M19.5 16.5l1.6.9M12 21v1.5M4.5 16.5l-1.6.9M4.5 7.2l-1.6-.9"
              stroke="url(#actGradMid)"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'chevron' && (
          <Path
            d="M9 5.5l6 6.5-6 6.5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {name === 'bell' && (
          <>
            <Path
              d="M18 10a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8z"
              stroke={color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M10.3 20a2.2 2.2 0 003.4 0"
              stroke={color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </Svg>
    </View>
  );
}
