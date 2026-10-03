"""Extract the Story30 handoff frame and measure the phone for the match cut.

Writes out/handoff.png (last frame), out/handoff-grid.png (10% grid overlay) and
out/handoff.json (phone bounding box, centre and tilt in 1080x1920 pixels).
"""

import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
W, H = 1080, 1920
# Phone back colour (#2A2926 / #45433F edge) after grade and grain: very dark, low saturation.
DARK = 75


def main() -> None:
    video = OUT / "story-30s.mp4"
    png = OUT / "handoff.png"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-sseof", "-0.05", "-i", str(video),
                    "-frames:v", "1", "-update", "1", str(png)], check=True)
    grid = ",".join(
        [f"drawbox=x={int(W * i / 10)}:y=0:w=2:h={H}:color=red@0.6:t=fill" for i in range(1, 10)]
        + [f"drawbox=x=0:y={int(H * i / 10)}:w={W}:h=2:color=red@0.6:t=fill" for i in range(1, 10)]
    )
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-vf", grid,
                    str(OUT / "handoff-grid.png")], check=True)

    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(png), "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    img = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(int)
    lum = img.mean(axis=2)
    sat = img.max(axis=2) - img.min(axis=2)
    # Search the central region only; hair is also dark, so exclude the head area above the chin.
    mask = (lum < DARK) & (sat < 30)
    mask[:780, :] = False
    mask[:, :300] = False
    mask[:, 780:] = False
    # Keep the contiguous band of rows around the densest row (the phone body), which
    # drops smaller dark details such as the pen in the apron pocket.
    rows = mask.sum(axis=1)
    if rows.max() == 0:
        raise SystemExit("phone not found")
    peak = int(np.argmax(rows))
    lo = hi = peak
    while lo > 0 and rows[lo - 1] > rows[peak] * 0.2:
        lo -= 1
    while hi < H - 1 and rows[hi + 1] > rows[peak] * 0.2:
        hi += 1
    mask[:lo, :] = False
    mask[hi + 1:, :] = False
    ys, xs = np.nonzero(mask)
    x0, x1 = int(np.percentile(xs, 0.5)), int(np.percentile(xs, 99.5))
    y0, y1 = int(np.percentile(ys, 0.5)), int(np.percentile(ys, 99.5))
    # Tilt from the principal axis of the phone pixels (0 = upright).
    cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
    vals, vecs = np.linalg.eigh(cov)
    major = vecs[:, np.argmax(vals)]
    tilt = float(np.degrees(np.arctan2(major[0], major[1])))
    if tilt > 90:
        tilt -= 180
    if tilt < -90:
        tilt += 180
    result = {
        "frame": 899,
        "size": [W, H],
        "phone_bbox_px": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
        "phone_center_px": [round((x0 + x1) / 2), round((y0 + y1) / 2)],
        "phone_center_pct": [round((x0 + x1) / 2 / W * 100, 1), round((y0 + y1) / 2 / H * 100, 1)],
        "phone_tilt_deg": round(tilt, 1),
        "screen_facing": "away from camera (back of phone visible)",
        "method": "dark low-saturation pixels in the central region of the last frame",
    }
    (OUT / "handoff.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
