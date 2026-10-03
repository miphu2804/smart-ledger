import React from 'react';
import { Composition } from 'remotion';
import { Story30 } from './story/Story30';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from './story/timeline';

// "Promo" (Story30 followed by the app section) is added once the app-section
// composition exists in this project.
export const RemotionRoot: React.FC = () => (
  <Composition id="Story30" component={Story30} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={TOTAL_FRAMES} />
);
