"""Build a synthetic ~3-minute 16:9 "talking head" test video.

Picture: ffmpeg testsrc2 with a drawn face that slowly drifts right (so the
crop has to follow it). Sound: espeak-ng reading SCRIPT (or, without espeak,
a hum per word). The exact word timings are written to transcript.json, which
the tests feed to make_shorts with --transcript (no Whisper needed).

    python3 make_test_video.py <out folder>
"""

import array
import json
import math
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

TITLE = "9 Things to Check Before Winter"
RATE = 22050
PAUSE = 0.35
MIN_LEN = 180.0
FACE_X = (1100, 1350)  # face center x at the start / end of the video

SCRIPT = [
    "Welcome back to the channel.",
    "In this video we're going to walk through the things I check on every house before winter.",
    "Let's get started.",
    "Most people never check their gutters until water is pouring into the basement.",
    "Clogged gutters push water against the foundation, and that water finds every crack.",
    "Take ten minutes on a dry afternoon, scoop out the leaves, and run a hose to see where the water goes.",
    "If the downspout dumps water right next to the house, add an extension so it lands at least four feet away.",
    "That one small fix has saved homeowners thousands of dollars in foundation repairs.",
    "Here's the mistake I see on almost every inspection.",
    "The outside faucets are left connected to a garden hose all winter.",
    "Water stays trapped in the pipe, it freezes, and the pipe splits inside the wall where you can't see it.",
    "You only find out in spring, when the basement ceiling is wet.",
    "So disconnect the hose, shut the inside valve, and open the outside tap to let it drain.",
    "As I said, small jobs like this matter.",
    "Don't forget the furnace filter.",
    "A dirty filter makes the furnace work harder, it costs you money, and it can shorten the life of the blower.",
    "Check it once a month during winter.",
    "Hold it up to a light, and if you can't see light through it, change it.",
    "By the way, the free checklist is the first link in the description.",
    "It has all twenty five things in one page, so grab it before you start.",
    "Why do smoke alarms fail when you need them most?",
    "Because the batteries are older than anyone remembers.",
    "Press the test button on every alarm, and replace any alarm that is more than ten years old.",
    "Look for the date printed on the back.",
    "If there is no date, it is almost certainly too old.",
    "Next, let's look at the roof.",
    "Stand back from the house with a pair of binoculars and look for missing or curled shingles.",
    "One missing shingle in October becomes a ceiling stain in January.",
    "Never climb on an icy roof to check it yourself.",
    "Call a roofer, it is cheaper than a broken hip.",
    "Here's a two minute test for your windows.",
    "Hold a lit incense stick near the frame on a windy day.",
    "If the smoke dances sideways, you have a draft, and a tube of caulk will fix most of it.",
    "Most people forget the sump pump until the storm is already here.",
    "Pour a bucket of water into the pit and make sure the pump kicks on by itself.",
    "If it hums but doesn't pump, the switch is stuck, and that is a cheap part to replace.",
    "Check your attic for daylight around the vents and the chimney.",
    "Daylight in the attic means snow and water can get in too.",
    "Thanks for watching, and if this helped, please subscribe.",
    "See you in the next video, and take care of your home.",
]

# (index of the first sentence, chapter title); times are filled in from the audio.
CHAPTERS = [
    (0, "Intro"),
    (3, "Gutters and downspouts"),
    (8, "Outside faucets"),
    (14, "Furnace filter"),
    (20, "Smoke alarms"),
    (25, "The roof"),
    (30, "Windows, sump pump and attic"),
    (38, "Wrap up"),
]


def _espeak() -> str | None:
    return shutil.which("espeak-ng") or shutil.which("espeak")


def _read_wav(path: Path) -> array.array:
    with wave.open(str(path)) as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1
        data = array.array("h", w.readframes(w.getnframes()))
        if w.getframerate() != RATE:  # crude resample, fine for a test tone/voice
            ratio = w.getframerate() / RATE
            data = array.array("h", (data[int(i * ratio)] for i in range(int(len(data) / ratio))))
    return data


def _trim(samples: array.array, thresh: int = 300) -> array.array:
    idx = [i for i in range(0, len(samples), 64) if abs(samples[i]) > thresh]
    if not idx:
        return samples
    return samples[max(0, idx[0] - 256) : min(len(samples), idx[-1] + 512)]


def _hum(duration: float) -> array.array:
    n = int(duration * RATE)
    return array.array("h", (int(6000 * math.sin(2 * math.pi * 170 * i / RATE) * math.sin(math.pi * i / n)) for i in range(n)))


def build_audio(tmp: Path) -> tuple[array.array, list[dict], list[float]]:
    """Speech for SCRIPT plus word timings (spread over each sentence by letter count)."""
    espeak = _espeak()
    audio = array.array("h", bytes(int(0.6 * RATE) * 2))
    words_out = []
    starts = []
    for k, sentence in enumerate(SCRIPT):
        if espeak:
            wav = tmp / f"s{k}.wav"
            subprocess.run([espeak, "-v", "en-us", "-s", "160", "-w", str(wav), sentence], check=True, capture_output=True)
            clip = _trim(_read_wav(wav))
        else:
            clip = array.array("h")
            for w in sentence.split():
                clip.extend(_hum(0.12 + 0.06 * len(w)))
                clip.extend(array.array("h", bytes(int(0.05 * RATE) * 2)))
        t0 = len(audio) / RATE
        starts.append(t0)
        dur = len(clip) / RATE
        ws = sentence.split()
        weights = [len(w.strip(",.?!")) + 1.5 for w in ws]
        t = t0 + 0.03
        span = dur - 0.08
        for w, wt in zip(ws, weights):
            d = span * wt / sum(weights)
            words_out.append({"word": w, "start": round(t, 3), "end": round(t + d * 0.92, 3)})
            t += d
        audio.extend(clip)
        audio.extend(array.array("h", bytes(int(PAUSE * RATE) * 2)))
    if len(audio) / RATE < MIN_LEN:
        audio.extend(array.array("h", bytes(int((MIN_LEN - len(audio) / RATE) * RATE) * 2)))
    return audio, words_out, starts


def build_face(path: Path) -> bool:
    """A simple shaded face (OpenCV's face detector finds it). False if OpenCV is missing."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return False
    s = 520
    hh = int(s * 1.35)
    img = np.zeros((hh, s, 4), np.uint8)
    cx, cy = s // 2, int(s * 0.6)

    def ell(center, axes, color, alpha=255):
        cv2.ellipse(img, center, axes, 0, 0, 360, (*color, alpha), -1)

    cv2.ellipse(img, (cx, hh), (s // 2, int(s * 0.3)), 0, 180, 360, (60, 50, 40, 255), -1)  # shoulders
    ell((cx, cy - 30), (int(s * 0.36), int(s * 0.44)), (40, 40, 50))  # hair
    yy, xx = np.mgrid[0:hh, 0:s]
    r2 = ((xx - cx) / (s * 0.3)) ** 2 + ((yy - cy) / (s * 0.4)) ** 2
    m = r2 <= 1
    skin = np.array([150, 180, 220], float)
    img[m, :3] = (skin * (1 - 0.35 * r2[m])[:, None]).clip(0, 255).astype(np.uint8)
    for dx in (-1, 1):
        ex, ey = cx + dx * int(s * 0.12), cy - int(s * 0.08)
        ell((ex, ey - int(s * 0.07)), (int(s * 0.07), int(s * 0.015)), (40, 40, 50))
        ell((ex, ey), (int(s * 0.06), int(s * 0.03)), (245, 245, 245))
        cv2.circle(img, (ex, ey), int(s * 0.025), (50, 40, 30, 255), -1)
    ell((cx, cy + int(s * 0.06)), (int(s * 0.035), int(s * 0.02)), (110, 130, 170))
    ell((cx, cy + int(s * 0.18)), (int(s * 0.1), int(s * 0.03)), (70, 70, 150))
    img[..., :3] = cv2.GaussianBlur(img[..., :3], (0, 0), 3)
    cv2.imwrite(str(path), img)
    return True


def face_center_x(t: float, duration: float) -> float:
    return FACE_X[0] + (FACE_X[1] - FACE_X[0]) * t / duration


def make(out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    video = out / "test_video.mp4"
    meta_path = out / "test_video.json"
    if video.exists() and meta_path.exists():
        return json.loads(meta_path.read_text())
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        audio, words, starts = build_audio(tmp)
        wav = tmp / "voice.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(audio.tobytes())
        dur = len(audio) / RATE
        face = tmp / "face.png"
        has_face = build_face(face)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc2=s=1920x1080:r=30:d={dur:.2f}",
        ]
        if has_face:
            x = f"{FACE_X[0]}+{FACE_X[1] - FACE_X[0]}*t/{dur:.2f}-w/2"
            cmd += [
                "-loop",
                "1",
                "-i",
                str(face),
                "-i",
                str(wav),
                "-filter_complex",
                f"[0:v][1:v]overlay=x='{x}':y=H-h:shortest=1:eval=frame,format=yuv420p[v]",
                "-map",
                "[v]",
                "-map",
                "2:a",
            ]
        else:
            cmd += ["-i", str(wav), "-map", "0:v", "-map", "1:a"]
        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-t",
            f"{dur:.2f}",
            str(video),
        ]
        subprocess.run(cmd, check=True)
    (out / "transcript.json").write_text(json.dumps({"duration": dur, "words": words}, indent=1))
    chapters = "".join(f"{int(starts[i]) // 60}:{int(starts[i]) % 60:02d} {t}\n" for i, t in CHAPTERS)
    (out / "chapters.txt").write_text(chapters.replace(chapters.split(" ", 1)[0], "0:00", 1))
    meta = {
        "video": str(video),
        "transcript": str(out / "transcript.json"),
        "chapters": str(out / "chapters.txt"),
        "title": TITLE,
        "duration": dur,
        "has_face": has_face,
        "speech": bool(_espeak()),
    }
    meta_path.write_text(json.dumps(meta, indent=1))
    return meta


if __name__ == "__main__":
    print(json.dumps(make(Path(sys.argv[1] if len(sys.argv) > 1 else "_work")), indent=1))
