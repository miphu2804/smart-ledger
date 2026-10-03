// Writes out/story-30s.srt from src/story/vo-lines.json.
// Cue ends use measured VO lengths from public/audio/story/vo-report.json when present.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FPS = 30;
const TAIL_FRAMES = 15;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = JSON.parse(readFileSync(join(root, 'src/story/vo-lines.json'), 'utf8'));
const reportPath = join(root, 'public/audio/story/vo-report.json');
const seconds = existsSync(reportPath)
  ? Object.fromEntries(JSON.parse(readFileSync(reportPath, 'utf8')).map((r) => [r.id, r.seconds]))
  : {};

const stamp = (frame) => {
  const t = Math.round((frame / FPS) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor(t / 60000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`;
};

const srt = lines
  .map((line, i) => {
    const end = seconds[line.id]
      ? Math.min(line.endFrame, line.startFrame + Math.ceil(seconds[line.id] * FPS) + TAIL_FRAMES)
      : line.endFrame;
    return `${i + 1}\n${stamp(line.startFrame)} --> ${stamp(end)}\n${line.text}\n`;
  })
  .join('\n');

mkdirSync(join(root, 'out'), { recursive: true });
writeFileSync(join(root, 'out/story-30s.srt'), srt, 'utf8');
console.log(srt);
