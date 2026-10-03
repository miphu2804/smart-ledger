import React from 'react';
import { AbsoluteFill, Html5Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import {
  BRAND_BUG,
  MUSIC,
  MUSIC_DUCKED_VOLUME,
  MUSIC_LIFT_FROM,
  MUSIC_LIFT_VOLUME,
  MUSIC_VOLUME,
  SAFE_X,
  USE_CLIPS,
} from './config';
import { fontFamily } from './fonts';
import { S1Dawn } from './scenes/S1Dawn';
import { S2aRush } from './scenes/S2aRush';
import { S2bWriting } from './scenes/S2bWriting';
import { S3Notes } from './scenes/S3Notes';
import { S4aNight } from './scenes/S4aNight';
import { S4bTired } from './scenes/S4bTired';
import { S5Morning } from './scenes/S5Morning';
import { S6Handoff } from './scenes/S6Handoff';
import { SFX } from './sound';
import { VO_LINES } from './subtitles';
import { AI_DISCLOSURE, DISSOLVE, SHOTS, SUPER, ShotId, TOTAL_FRAMES, shotById } from './timeline';

const SCENES: Record<ShotId, React.FC> = {
  S1: S1Dawn,
  S2a: S2aRush,
  S2b: S2bWriting,
  S3: S3Notes,
  S4a: S4aNight,
  S4b: S4bTired,
  S5: S5Morning,
  S6: S6Handoff,
};

// Hard cuts everywhere except a 6-frame dissolve centred on the S4b -> S5 cut.
const Shots: React.FC = () => {
  const frame = useCurrentFrame();
  const half = DISSOLVE.frames / 2;
  const cut = shotById(DISSOLVE.after).from + shotById(DISSOLVE.after).durationInFrames;
  return (
    <>
      {SHOTS.map((shot) => {
        const Scene = SCENES[shot.id];
        const content = USE_CLIPS ? <OffthreadVideo src={staticFile(`clips/${shot.id}.mp4`)} muted /> : <Scene />;
        const isOut = shot.id === DISSOLVE.after;
        const isIn = shot.from === cut;
        const from = isIn ? shot.from - half : shot.from;
        const duration = shot.durationInFrames + (isOut || isIn ? half : 0);
        const opacity = isIn ? interpolate(frame, [cut - half, cut + half], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
        return (
          <Sequence key={shot.id} name={shot.id} from={from} durationInFrames={duration}>
            <AbsoluteFill style={{ opacity }}>{content}</AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};

// One shared grade, grain and vignette across all shots.
const Film: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(26,25,22,0.38) 100%)' }}
      />
      <AbsoluteFill style={{ mixBlendMode: 'overlay', opacity: 0.16 }}>
        <Img src={staticFile(`fx/grain-${Math.floor(frame / 2) % 4}.png`)} style={{ width: '100%', height: '100%' }} />
      </AbsoluteFill>
    </>
  );
};

const Super: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [SUPER.from, SUPER.from + 8, SUPER.to - 8, SUPER.to], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: SAFE_X.left,
          width: SAFE_X.right - SAFE_X.left,
          top: SUPER.centerY,
          transform: 'translateY(-50%)',
          textAlign: 'center',
          fontFamily,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.18,
          textWrap: 'balance',
          color: '#FFFFFF',
          textShadow: '0 2px 18px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.35)',
          opacity,
        }}
      >
        {SUPER.text}
      </div>
    </AbsoluteFill>
  );
};

const Disclosure: React.FC = () => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        left: SAFE_X.left,
        width: SAFE_X.right - SAFE_X.left,
        bottom: 96,
        textAlign: 'center',
        fontFamily,
        fontWeight: 500,
        fontSize: 24,
        color: 'rgba(247,246,242,0.72)',
        textShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 12px rgba(0,0,0,0.35)',
      }}
    >
      {AI_DISCLOSURE}
    </div>
  </AbsoluteFill>
);

// Static brand bug (no logo animation), frames 0-90, only when BRAND_BUG is on.
const BrandBug: React.FC = () => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        left: SAFE_X.left,
        top: 150,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: 0.7,
        fontFamily,
        fontWeight: 800,
        fontSize: 40,
        color: '#FFFFFF',
        textShadow: '0 1px 8px rgba(0,0,0,0.35)',
      }}
    >
      <Img src={staticFile('brand/mascot.png')} style={{ width: 56, height: 56, borderRadius: 14 }} />
      Sổ Nghe Lời
    </div>
  </AbsoluteFill>
);

const voWindows = VO_LINES.map((l) => [l.startFrame, l.endFrame] as const);

const musicVolume = (f: number) => {
  const ducked = voWindows.some(([a, b]) => f >= a - 6 && f <= b + 6);
  const base = f >= MUSIC_LIFT_FROM ? MUSIC_LIFT_VOLUME : MUSIC_VOLUME;
  return ducked && f < MUSIC_LIFT_FROM ? MUSIC_DUCKED_VOLUME : base;
};

const Sound: React.FC = () => (
  <>
    {VO_LINES.map((line) => (
      <Sequence key={line.id} name={`VO ${line.id}`} from={line.startFrame} durationInFrames={line.endFrame - line.startFrame}>
        <Html5Audio src={staticFile(`audio/story/${line.id}.mp3`)} />
      </Sequence>
    ))}
    {SFX.map((cue, i) => (
      <Sequence key={i} name={`SFX ${cue.file}`} from={cue.from} durationInFrames={cue.duration}>
        <Html5Audio
          src={staticFile(`audio/story/sfx/${cue.file}.wav`)}
          loop={cue.loop}
          volume={(f) =>
            cue.fadeOut
              ? cue.volume * interpolate(f, [cue.duration - cue.fadeOut, cue.duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
              : cue.volume
          }
        />
      </Sequence>
    ))}
    {MUSIC && (
      <Sequence name="Music" from={0} durationInFrames={TOTAL_FRAMES}>
        <Html5Audio src={staticFile('audio/music.mp3')} volume={musicVolume} />
      </Sequence>
    )}
  </>
);

export const Story30: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <AbsoluteFill style={{ filter: 'contrast(1.04) saturate(0.94) sepia(0.06)' }}>
      <Shots />
    </AbsoluteFill>
    <Film />
    <Super />
    <Disclosure />
    {BRAND_BUG && (
      <Sequence name="Brand bug" from={0} durationInFrames={91}>
        <BrandBug />
      </Sequence>
    )}
    <Sound />
  </AbsoluteFill>
);

