# Commotio Cordis: How a Blow Can Stop a Heart

An 8 minute educational video explaining commotio cordis, where a hit to the chest at exactly the wrong moment sends a healthy heart into ventricular fibrillation. It covers how the heart's electrical system works (sodium, potassium and calcium doors, the lockout, the vulnerable window on the T wave), how a hit causes re-entry and VF, and why an AED fixes it.

The finished video is attached to the latest release.

Everything is generated from code. The narration is Kokoro TTS (voice `bm_fable`), and each scene is an HTML canvas / Three.js animation that is rendered frame by frame in headless Chromium and timed to the narration's word timestamps.

## Layout

- `script.json` is the narration, split into scenes and cues, plus pronunciation fixes.
- `tts.py` synthesises each cue, writes one WAV per scene and `build/timings.json` with cue and word times.
- `scenes/` has one HTML file per scene. `lib.js`, `shared.js`, `grid2d.js`, `lib3d.js` and `heart3d.js` are the shared drawing helpers.
- `render.mjs` renders a scene to MP4 with Playwright and ffmpeg.
- `join.py` joins the scene MP4s into `build/final.mp4`.
- `storyboard.md` is the original plan for each scene.

## Building

Needs Node 20+, Python 3.13 and [uv](https://github.com/astral-sh/uv).

```bash
npm install
npx playwright install chromium
uv venv && uv pip install -r requirements.txt
.venv/bin/python tts.py
for s in s01_hook s02_pump s03_spark s04_wiring s05_muscle s06_lockout s07_window s08_impact s09_vf s10_aed; do node render.mjs $s; done
.venv/bin/python join.py
```

`tts.py` and `render.mjs` take a scene id to rebuild just that scene. `node render.mjs <scene> --stills 3.5,20` writes still frames for checking.

## Credits

The 3D heart model is from [NIH 3D](https://3d.nih.gov/entries/download/22787/2) and is in the public domain (CC0).

This video is for education only and is not medical advice.
