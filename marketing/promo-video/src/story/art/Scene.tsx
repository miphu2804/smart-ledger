import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HEIGHT, WIDTH } from '../timeline';

// One SVG stage per shot with a camera transform (scale around a focus point).
export const Stage: React.FC<{
  camera?: { x: number; y: number; scale: number; r?: number };
  background?: string;
  children: React.ReactNode;
  defs?: React.ReactNode;
}> = ({ camera = { x: WIDTH / 2, y: HEIGHT / 2, scale: 1 }, background = '#000', children, defs }) => {
  const { x, y, scale, r = 0 } = camera;
  return (
    <AbsoluteFill style={{ background }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} style={{ display: 'block' }}>
        <defs>
          <filter id="blur-xs" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={2} />
          </filter>
          <filter id="blur-sm" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={5} />
          </filter>
          <filter id="blur-md" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={10} />
          </filter>
          <filter id="blur-lg" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={22} />
          </filter>
          <filter id="motion" x="-40%" y="-10%" width="180%" height="120%">
            <feGaussianBlur stdDeviation="36 4" />
          </filter>
          {defs}
        </defs>
        <g transform={`translate(${WIDTH / 2} ${HEIGHT / 2}) rotate(${r}) scale(${scale}) translate(${-x} ${-y})`}>{children}</g>
      </svg>
    </AbsoluteFill>
  );
};
