"""Where is the face? OpenCV Haar cascade on sampled frames, smoothed.

Returns keyframes (clip time, face center x in source pixels) or None when no
face is found often enough (the caller then crops the center).
"""

import statistics
from pathlib import Path

SAMPLE_EVERY = 1.0
KEY_EVERY = 2.0
MIN_HIT_RATE = 0.3


def _median_filter(xs: list[float], k: int = 5) -> list[float]:
    h = k // 2
    return [statistics.median(xs[max(0, i - h) : i + h + 1]) for i in range(len(xs))]


def _mean_filter(xs: list[float], k: int = 3) -> list[float]:
    h = k // 2
    return [sum(xs[max(0, i - h) : i + h + 1]) / len(xs[max(0, i - h) : i + h + 1]) for i in range(len(xs))]


def smooth(samples: list[tuple[float, float | None]], width: int) -> list[tuple[float, float]] | None:
    """Fill misses, remove jumps, and return keyframes every KEY_EVERY seconds."""
    hits = [s for s in samples if s[1] is not None]
    if not samples or len(hits) < max(1, MIN_HIT_RATE * len(samples)):
        return None
    xs: list[float] = []
    for t, x in samples:
        if x is None:  # nearest detection in time
            x = min(hits, key=lambda h: abs(h[0] - t))[1]
        xs.append(x)
    xs = _mean_filter(_median_filter(xs))
    if max(xs) - min(xs) < 0.04 * width:  # a talking head barely moves: hold still
        return [(0.0, statistics.median(xs))]
    keys = []
    for (t, _), x in zip(samples, xs):
        if not keys or t - keys[-1][0] >= KEY_EVERY - 1e-6:
            keys.append((t, x))
    if keys[-1][0] != samples[-1][0]:
        keys.append((samples[-1][0], xs[-1]))
    return keys


def track(video: Path, start: float, end: float, width: int, height: int):
    try:
        import cv2
    except ImportError:
        return None
    if not hasattr(cv2, "CascadeClassifier"):
        return None
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if cascade.empty():
        return None
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        return None
    scale = 640 / width
    samples: list[tuple[float, float | None]] = []
    t = 0.0
    try:
        while start + t < end - 0.2:
            cap.set(cv2.CAP_PROP_POS_MSEC, (start + t) * 1000)
            ok, frame = cap.read()
            x = None
            if ok:
                small = cv2.resize(frame, (640, max(1, int(height * scale))))
                gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
                faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(int(small.shape[0] / 10),) * 2)
                if len(faces):
                    fx, _, fw, _ = max(faces, key=lambda f: f[2] * f[3])  # biggest face
                    x = (fx + fw / 2) / scale
            samples.append((t, x))
            t += SAMPLE_EVERY
    finally:
        cap.release()
    return smooth(samples, width)
