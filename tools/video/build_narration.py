#!/usr/bin/env python3
"""Build narration audio + timeline + transcript for a vibepress video briefing.

Usage: build_narration.py script.json OUT_DIR

Synthesises each sentence with macOS `say`, joins them with fixed pauses, encodes
OUT_DIR/narration.m4a, and writes OUT_DIR/timeline.js (window.BRIEFING = {...}) with
exact per-scene and per-sentence start/end times, plus OUT_DIR/transcript.txt.
"""
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

RATE_HZ = 22050
LEAD_IN = 0.6
SENTENCE_GAP = 0.32
SCENE_GAP = 0.9
TAIL = 1.6


def synth(text, voice, rate, out_wav):
    subprocess.run(
        ["say", "-v", voice, "-r", str(rate), "-o", str(out_wav),
         f"--data-format=LEI16@{RATE_HZ}", text],
        check=True,
    )


def read_frames(path):
    with wave.open(str(path), "rb") as w:
        if w.getframerate() != RATE_HZ or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"unexpected wav format: {path}")
        return w.readframes(w.getnframes())


def silence(seconds):
    return b"\x00\x00" * int(round(seconds * RATE_HZ))


def fmt_clock(seconds):
    s = int(seconds)
    return f"{s // 60}:{s % 60:02d}"


def build(script, out_dir, tmp):
    pcm = [silence(LEAD_IN)]
    t = LEAD_IN
    scenes = []
    for si, scene in enumerate(script["scenes"]):
        if si:
            pcm.append(silence(SCENE_GAP))
            t += SCENE_GAP
        start = t
        lines = []
        for li, line in enumerate(scene["lines"]):
            if li:
                pcm.append(silence(SENTENCE_GAP))
                t += SENTENCE_GAP
            wav = tmp / f"{si:02d}_{li:02d}.wav"
            synth(line.get("say", line["text"]), script["voice"], script["rate"], wav)
            frames = read_frames(wav)
            dur = len(frames) / 2 / RATE_HZ
            pcm.append(frames)
            lines.append({"start": round(t, 3), "end": round(t + dur, 3), "text": line["text"]})
            t += dur
        scenes.append({"id": scene["id"], "title": scene["title"], "start": round(start, 3),
                       "end": round(t, 3), "lines": lines})
    pcm.append(silence(TAIL))
    t += TAIL
    # Each scene owns the time up to the next scene's start, so there is never a blank gap.
    for a, b in zip(scenes, scenes[1:]):
        a["end"] = b["start"]
    scenes[-1]["end"] = round(t, 3)

    raw = tmp / "narration.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE_HZ)
        w.writeframes(b"".join(pcm))
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100",
         "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(out_dir / "narration.m4a")],
        check=True,
    )
    return {"paper": script["paper"], "date": script["date"], "duration": round(t, 3), "scenes": scenes}


def write_transcript(timeline, path):
    out = [f"# {timeline['paper']} — video briefing, {timeline['date']}", ""]
    for scene in timeline["scenes"]:
        out.append(f"## {scene['title']} ({fmt_clock(scene['start'])})")
        out.append(" ".join(line["text"] for line in scene["lines"]))
        out.append("")
    path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    script = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        timeline = build(script, out_dir, Path(tmp))
    (out_dir / "timeline.js").write_text(
        "window.BRIEFING = " + json.dumps(timeline, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    write_transcript(timeline, out_dir / "transcript.txt")
    print(f"duration {fmt_clock(timeline['duration'])} ({timeline['duration']}s), "
          f"{len(timeline['scenes'])} scenes → {out_dir}")


if __name__ == "__main__":
    main()
