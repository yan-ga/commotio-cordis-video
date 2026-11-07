"""Join the rendered scene MP4s, in script order, into build/final.mp4."""
import json, subprocess
from pathlib import Path
import imageio_ffmpeg

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
scenes = [s["id"] for s in json.loads((ROOT / "script.json").read_text())["scenes"]]
missing = [s for s in scenes if not (BUILD / "scenes" / f"{s}.mp4").exists()]
if missing:
    raise SystemExit(f"Not rendered yet: {', '.join(missing)}")
lst = BUILD / "scenes" / "list.txt"
lst.write_text("".join(f"file '{BUILD / 'scenes' / f'{s}.mp4'}'\n" for s in scenes))
out = BUILD / "final.mp4"
# Re-encode audio so tiny per-scene AAC priming gaps don't drift the sync; video is copied.
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                "-i", str(lst), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)], check=True)
print(out)
