"""Synthesise narration per cue with Kokoro, then build one WAV per scene
plus build/timings.json (cue start/end and each word's start, in seconds) that the animations sync to."""
import json, re, sys, wave
from pathlib import Path
import numpy as np
import soundfile as sf
import misaki.espeak

# The espeak build bundled with misaki can't find its data on this Mac and kills the process.
# Kokoro only uses it for words missing from its dictionary, so skip it and flag those words instead.
misaki.espeak.EspeakFallback = lambda **k: None
from kokoro import KPipeline

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
RATE = 24000
HEAD, GAP, TAIL = 0.8, 0.5, 1.2  # seconds of silence around cues

script = json.loads((ROOT / "script.json").read_text())
only = set(sys.argv[1:])
tpath = BUILD / "timings.json"
timings = json.loads(tpath.read_text()) if tpath.exists() else {}
pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")


def spoken(text):
    # Whole words only, so "AED" never matches inside "AEDs" or inside a pronunciation already put in.
    for written, said in script.get("pronounce", {}).items():
        text = re.sub(rf"(?<![\w\[]){re.escape(written)}(?![\w\]])", lambda m: said, text)
    return text


def silence(sec):
    return np.zeros(int(sec * RATE), dtype=np.float32)


for scene in script["scenes"]:
    sid = scene["id"]
    if only and sid not in only:
        continue
    cue_dir = BUILD / "audio" / sid
    cue_dir.mkdir(parents=True, exist_ok=True)
    parts, cues, t = [silence(HEAD)], [], HEAD
    for i, cue in enumerate(scene["cues"]):
        # A cue is either plain text or {"text": ..., "pause": seconds of silence after it}.
        text = cue["text"] if isinstance(cue, dict) else cue
        gap = cue.get("pause", GAP) if isinstance(cue, dict) else GAP
        say = spoken(text)
        out, stamp, wfile = cue_dir / f"{i:02d}.wav", cue_dir / f"{i:02d}.txt", cue_dir / f"{i:02d}.words.json"
        key = f"{script['voice']}|{script.get('speed', 1.0)}|{say}"
        # Cached: only re-synthesise when the spoken text or voice changes.
        if not out.exists() or not wfile.exists() or not stamp.exists() or stamp.read_text() != key:
            _, tokens = pipe.g2p(say)
            unknown = [tk.text for tk in tokens if not tk.phonemes and any(c.isalpha() for c in tk.text)]
            if unknown:
                raise SystemExit(f"{sid} cue {i}: no pronunciation for {unknown}; add them to 'pronounce'")
            chunks, words, at = [], [], 0.0
            for r in pipe(say, voice=script["voice"], speed=script.get("speed", 1.0)):
                a = np.asarray(r.audio, dtype=np.float32)
                words += [[tk.text, round(at + tk.start_ts, 3)] for tk in (r.tokens or []) if tk.start_ts is not None]
                chunks.append(a)
                at += len(a) / RATE
            audio = np.concatenate(chunks)
            sf.write(out, audio, RATE)
            wfile.write_text(json.dumps(words))
            stamp.write_text(key)
        audio, _ = sf.read(out, dtype="float32")
        dur = len(audio) / RATE
        # Word starts are exact; cue ends include the voice's trailing silence (often most of a second).
        words = [[w, round(t + s, 3)] for w, s in json.loads(wfile.read_text())]
        cues.append({"text": text, "start": round(t, 3), "end": round(t + dur, 3), "words": words})
        parts.append(audio)
        t += dur
        if i < len(scene["cues"]) - 1:
            parts.append(silence(gap))
            t += gap
    parts.append(silence(TAIL))
    t += TAIL
    pcm = (np.clip(np.concatenate(parts), -1, 1) * 32767).astype("<i2")
    with wave.open(str(BUILD / "audio" / f"{sid}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    timings[sid] = {"title": scene["title"], "duration": round(t, 3), "cues": cues}

ids = [s["id"] for s in script["scenes"]]
timings = {k: timings[k] for k in ids if k in timings}
tpath.write_text(json.dumps(timings, indent=1))
print(f"total {sum(s['duration'] for s in timings.values()):.1f}s")
