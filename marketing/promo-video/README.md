# Promo video — Story30 opener

Remotion project for the 30-second story opener of the "Sổ Nghe Lời" ad: Cô Lan, a
fictional shop owner, opens her shop, writes every sale in a notebook, cannot make the
numbers add up at night, and one morning picks up her phone. No app UI; the last frame
match-cuts into the app section, which is built separately.

## Status

- **Picture: illustrated preview.** The shots are drawn in SVG (`src/story/scenes/`) because
  no AI-generated clips exist yet. Timing, framing, supers and audio follow the shotlist, so
  the edit can be reviewed now. When conformed clips exist, set `USE_CLIPS = true` in
  `src/story/config.ts` and place them at `public/clips/<shot>.mp4` (1080×1920, H.264, 30 fps,
  no audio; S6 must already hold its last usable frame from frame 894).
- **Voice-over: temporary voice.** `edge-tts` (`vi-VN-HoaiMyNeural`) is the intended voice.
  `scripts/make-vo.py` renders the same lines offline with Piper `vi_VN-vais1000-medium`
  (trained on the VAIS-1000 corpus, CC BY 4.0) when the edge-tts endpoint is unreachable.
- **Music: none.** Add `public/audio/music.mp3` and set `MUSIC = true`; volume 0.3, ducked to
  0.1 under VO, lift at frame 870.
- **Ambience and Foley** are synthesized with ffmpeg (`scripts/make-sfx.sh`); nothing is
  downloaded.
- **Promo** (Story30 followed by the app section) is not registered: the app-section
  composition does not exist yet.

## Commands

Run from `marketing/promo-video/`. Generated media are git-ignored and rebuilt by scripts.

```bash
npm install
python3 scripts/make-vo.py          # public/audio/story/vo-*.mp3 + vo-report.json
./scripts/make-sfx.sh               # public/audio/story/sfx/*.wav
python3 scripts/make-fx.py          # public/fx/grain-*.png
npm run studio                      # preview in Remotion Studio
npm run render:story                # out/story-30s.mp4
npm run srt                         # out/story-30s.srt
python3 scripts/handoff.py          # out/handoff.png, handoff-grid.png, handoff.json
```

If Remotion cannot download its headless browser, point it at a local one:
`REMOTION_BROWSER_EXECUTABLE=/path/to/headless_shell npm run render:story`.

## Files

| Path | Purpose |
|---|---|
| `src/story/timeline.ts` | Shot slots (asserted to sum to 900 frames), dissolve, super, disclosure |
| `src/story/vo-lines.json`, `subtitles.ts` | VO copy and windows, shared by VO, SRT and the edit |
| `src/story/config.ts` | `USE_CLIPS`, `BRAND_BUG`, `MUSIC`, volumes, safe zone |
| `src/story/Story30.tsx` | Composition: shots, grade, supers, AI disclosure, audio |
| `src/story/scenes/`, `src/story/art/` | Illustrated shots, character, props |
| `public/fonts/` | Plus Jakarta Sans 500/800 (SIL OFL 1.1, `OFL.txt`) |
| `public/brand/mascot.png` | Mascot for the optional static brand bug |
