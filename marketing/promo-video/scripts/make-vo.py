"""Generate the Story30 voice-over lines offline.

edge-tts (vi-VN-HoaiMyNeural) is the intended voice. When its endpoint is
unreachable, this script renders a temporary voice with the Piper
vi_VN-vais1000-medium model via sherpa-onnx so the edit can be previewed.

Usage: python3 scripts/make-vo.py [--model-dir /data/tts/vits-piper-vi_VN-vais1000-medium]
"""

import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio" / "story"
LINES = json.loads((ROOT / "src" / "story" / "vo-lines.json").read_text(encoding="utf-8"))
FPS = 30
MAX_ATEMPO = 1.08
# A slightly slower read suits the quiet, observational tone.
SPEED = 0.85


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default="/data/tts/vits-piper-vi_VN-vais1000-medium")
    args = parser.parse_args()
    model_dir = Path(args.model_dir)

    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(model_dir / "vi_VN-vais1000-medium.onnx"),
                tokens=str(model_dir / "tokens.txt"),
                data_dir=str(model_dir / "espeak-ng-data"),
            ),
            num_threads=4,
        ),
    )
    tts = sherpa_onnx.OfflineTts(config)
    OUT.mkdir(parents=True, exist_ok=True)

    report = []
    for line in LINES:
        audio = tts.generate(line["text"], sid=0, speed=SPEED)
        wav = OUT / f"{line['id']}.wav"
        with wave.open(str(wav), "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(audio.sample_rate)
            samples = np.clip(np.asarray(audio.samples, dtype=np.float32), -1.0, 1.0)
            f.writeframes((samples * 32767).astype("<i2").tobytes())

        seconds = len(audio.samples) / audio.sample_rate
        budget = (line["endFrame"] - line["startFrame"]) / FPS
        tempo = 1.0
        if seconds > budget:
            tempo = min(MAX_ATEMPO, seconds / budget)
        mp3 = OUT / f"{line['id']}.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
             "-af", f"silenceremove=start_periods=1:start_threshold=-50dB,"
                    f"areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                    f"atempo={tempo:.3f},loudnorm=I=-16:TP=-1.5",
             "-ar", "48000", "-ac", "2", "-b:a", "192k", str(mp3)],
            check=True,
        )
        wav.unlink()
        final = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(mp3)],
            check=True, capture_output=True, text=True,
        ).stdout)
        report.append({
            "id": line["id"],
            "seconds": round(final, 2),
            "budget": round(budget, 2),
            "atempo": round(tempo, 3),
            "fits": final <= budget,
        })

    (OUT / "vo-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    for row in report:
        print(row)


if __name__ == "__main__":
    main()
