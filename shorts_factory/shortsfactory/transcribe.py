"""Speech to text with word timestamps (faster-whisper), plus transcript caching
and splitting the words into sentences."""

import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

CACHE_VERSION = 1
SENTENCE_END = re.compile(r"[.!?]['\")\]]*$")
MAX_SENTENCE_SEC = 18.0


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Sentence:
    words: list[Word] = field(default_factory=list)

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


def _source_info(video: Path) -> dict:
    st = video.stat()
    return {"name": video.name, "size": st.st_size, "mtime": int(st.st_mtime)}


def load_transcript_file(path: Path) -> tuple[list[Word], float | None]:
    """Read our transcript JSON (or a hand-written fixture with the same shape).

    Accepts {"words": [...]} or {"segments": [{"words": [...]}, ...]};
    each word is {"word"|"text", "start", "end"}.
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    raw = data.get("words")
    if raw is None:
        raw = [w for seg in data.get("segments", []) for w in seg.get("words", [])]
    words = []
    for w in raw:
        text = str(w.get("word", w.get("text", ""))).strip()
        if text:
            words.append(Word(text, float(w["start"]), float(w["end"])))
    words.sort(key=lambda w: w.start)
    return words, data.get("duration")


def _save(path: Path, words: list[Word], meta: dict) -> None:
    data = dict(meta)
    data["words"] = [{"word": w.text, "start": round(w.start, 3), "end": round(w.end, 3)} for w in words]
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def _load_model(model_name: str):
    from faster_whisper import WhisperModel  # imported late: tests run without it

    try:
        return WhisperModel(model_name, device="cpu", compute_type="int8", local_files_only=True)
    except Exception:  # noqa: BLE001 — not downloaded yet
        print(f"  Downloading the speech model '{model_name}' (one time only, needs internet)…", flush=True)
        return WhisperModel(model_name, device="cpu", compute_type="int8")


def transcribe(video: Path, cache: Path, model_name: str = "small.en", lang: str = "en") -> tuple[list[Word], float | None]:
    """Transcribe `video`, or reuse `cache` when it belongs to the same file and model."""
    src = _source_info(video)
    if cache.exists():
        try:
            meta = json.loads(cache.read_text(encoding="utf-8"))
            if meta.get("version") == CACHE_VERSION and meta.get("source") == src and meta.get("model") == model_name:
                print("  Using the saved transcript (delete transcript.json to redo it).")
                return load_transcript_file(cache)
        except (ValueError, OSError):
            pass

    model = _load_model(model_name)
    t0 = time.time()
    # English-only models (".en") must not be given another language.
    language = "en" if model_name.endswith(".en") else (lang or None)
    segments, info = model.transcribe(str(video), language=language, word_timestamps=True, vad_filter=True, beam_size=5)
    words: list[Word] = []
    total = info.duration or 0
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append(Word(text, float(w.start), float(w.end)))
        if total and sys.stdout.isatty():
            print(f"\r  Listening… {min(100, seg.end / total * 100):5.1f}%", end="", flush=True)
    if total and sys.stdout.isatty():
        print()
    print(f"  Transcribed {len(words)} words in {time.time() - t0:.0f} s.")
    _save(
        cache, words, {"version": CACHE_VERSION, "source": src, "model": model_name, "language": info.language, "duration": total}
    )
    return words, total


def _split_long(words: list[Word]) -> list[list[Word]]:
    """Split a run-on sentence at its best pause (prefer commas) until each part is short enough."""
    if words[-1].end - words[0].start <= MAX_SENTENCE_SEC or len(words) < 6:
        return [words]
    best, best_score = None, -1.0
    for i in range(2, len(words) - 2):
        gap = words[i].start - words[i - 1].end
        score = gap + (0.5 if words[i - 1].text.endswith((",", ";", ":")) else 0)
        # Prefer the middle so both halves shrink.
        score -= abs(i - len(words) / 2) / len(words) * 0.3
        if score > best_score:
            best, best_score = i, score
    return _split_long(words[:best]) + _split_long(words[best:])


def sentences_from_words(words: list[Word], pause: float = 1.2) -> list[Sentence]:
    out: list[Sentence] = []
    cur: list[Word] = []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt is None or SENTENCE_END.search(w.text) or nxt.start - w.end > pause:
            out.extend(Sentence(part) for part in _split_long(cur))
            cur = []
    return out
