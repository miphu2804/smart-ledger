// Toggles for the Story30 edit.

// false: illustrated preview scenes (src/story/scenes).
// true: conformed AI clips, 1080x1920 H.264 30 fps, from public/clips/<shot>.mp4
// (copy or link story/final/<shot>.mp4 there). Timing and overlays are unchanged.
export const USE_CLIPS = false;

// Static brand bug (mascot + name), top-left, frames 0-90. Not an animated logo.
export const BRAND_BUG = false;

// Set to true only when public/audio/music.mp3 has been provided.
export const MUSIC = false;

export const MUSIC_VOLUME = 0.3;
export const MUSIC_DUCKED_VOLUME = 0.1;
export const MUSIC_LIFT_FROM = 870;
export const MUSIC_LIFT_VOLUME = 0.45;

// Safe zone for supers and the disclosure line.
export const SAFE_X = { left: 90, right: 990 };
