"""Generate film-grain frames for the Story30 grade: public/fx/grain-{0..3}.png."""

from pathlib import Path

import numpy as np
import subprocess

OUT = Path(__file__).resolve().parent.parent / "public" / "fx"
W, H = 540, 960


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    for i in range(4):
        noise = np.clip(rng.normal(128, 38, (H, W)), 0, 255).astype(np.uint8)
        raw = OUT / f"grain-{i}.gray"
        raw.write_bytes(noise.tobytes())
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray",
             "-s", f"{W}x{H}", "-i", str(raw), str(OUT / f"grain-{i}.png")],
            check=True,
        )
        raw.unlink()


if __name__ == "__main__":
    main()
