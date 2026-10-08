"""Titles, descriptions and the output files: shorts.csv, SHORTS.md, report.md,
channel-studio-import.json."""

import csv
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from .channels import Channel
from .moments import FILLER_START, Clip, keywords, stem, title_case

TITLE_MAX = 100
# Title words that make a poor "Topic:" prefix ("Check: …").
VERBS = set(
    """check checking make do use need fix know buy avoid try built build eat order cook stop start find
    look keep clean test ask tell said say want see watch save pay pick put run take turn wish""".split()
)


def mmss(sec: float) -> str:
    s = max(0, int(sec))
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def source_range(clip: Clip) -> str:
    """Whole seconds, like Channel Studio: '1:05–1:50'."""
    return f"{mmss(math.floor(clip.start))}–{mmss(math.ceil(clip.end))}"


def spoken_hook(clip: Clip, max_words: int = 12) -> str:
    """The clip's opening line, cut to Channel Studio's 12-word hook limit."""
    words = clip.sentences[0].text.split()
    return " ".join(words) if len(words) <= max_words else " ".join(words[:max_words]).rstrip(",;:") + "…"


def _clean_sentence(text: str) -> str:
    words = text.split()
    while len(words) > 3 and words[0].lower().strip(",") in FILLER_START:
        words.pop(0)
    out = " ".join(words).strip()
    return out[:1].upper() + out[1:]


def _no_clickbait_end(title: str) -> str:
    title = re.sub(r"(\s*[!.…:;,–—-])+$", "", title.strip())
    return re.sub(r"\?+$", "?", title)


def make_title(clip: Clip, hook: str, long_title: str) -> str:
    """≤ 100 chars, contains a keyword from the long title, no '!!!' / '...' ending."""
    first = _clean_sentence(clip.sentences[0].text)
    core = first if len(first) <= 75 else hook
    core = _no_clickbait_end(core)
    kws = keywords(long_title)
    core_stems = {stem(w) for w in keywords(core)}
    if kws and not any(stem(k) in core_stems for k in kws):
        clip_stems = {stem(w) for w in keywords(clip.text)}
        # The topic word is usually a noun near the end of the title ("… Before Winter").
        topics = [k for k in kws if k not in VERBS] or kws
        kw = next((k for k in reversed(topics) if stem(k) in clip_stems), topics[-1])
        core = f"{title_case([kw])}: {core}"
    if len(core) > TITLE_MAX:
        core = core[: TITLE_MAX + 1].rsplit(" ", 1)[0]
        core = _no_clickbait_end(core)
    return core


def make_description(clip: Clip, long_title: str, ch: Channel) -> str:
    first = _clean_sentence(clip.sentences[0].text)
    if len(first) > 150:
        first = first[:150].rsplit(" ", 1)[0] + "…"
    return "\n".join([first, f"From the full video: {long_title}", "", ch.link_line, "", " ".join(("#shorts", *ch.hashtags))])


@dataclass
class ShortPlan:
    n: int
    clip: Clip
    hook: str
    title: str
    description: str
    file: str = ""
    cover: str = ""
    face_found: bool | None = None

    @property
    def reasons_text(self) -> str:
        return "; ".join(f"{p:+g} {why}" for p, why in self.clip.reasons)


def unique_titles(plans: list[ShortPlan]) -> None:
    seen: dict[str, int] = {}
    for p in plans:
        key = p.title.lower()
        if key in seen:
            seen[key] += 1
            p.title = f"{p.title[: TITLE_MAX - 9]} (Part {seen[key]})"
        else:
            seen[key] = 1


def slug(text: str, n: int = 40) -> str:
    s = re.sub(r"[^\w\s-]", "", text).strip()
    s = re.sub(r"\s+", " ", s)[:n].strip()
    return s or "short"


CSV_FIELDS = [
    "n",
    "file",
    "cover",
    "title",
    "description",
    "hook",
    "on_screen_text",
    "source_start",
    "source_end",
    "source_range",
    "duration_sec",
    "score",
    "reasons",
    "chapter",
]


def write_csv(path: Path, plans: list[ShortPlan]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        for p in plans:
            w.writerow(
                {
                    "n": p.n,
                    "file": p.file,
                    "cover": p.cover,
                    "title": p.title,
                    "description": p.description,
                    "hook": spoken_hook(p.clip),
                    "on_screen_text": p.hook,
                    "source_start": f"{p.clip.start:.2f}",
                    "source_end": f"{p.clip.end:.2f}",
                    "source_range": source_range(p.clip),
                    "duration_sec": f"{p.clip.duration:.1f}",
                    "score": f"{p.clip.score:.2f}",
                    "reasons": p.reasons_text,
                    "chapter": p.clip.chapter,
                }
            )


def write_markdown(path: Path, plans: list[ShortPlan], long_title: str, ch: Channel) -> None:
    lines = [f"# Shorts from “{long_title}”", "", f"Channel: **{ch.name}** · {len(plans)} Shorts", ""]
    for p in plans:
        lines += [
            f"## {p.n}. {p.title}",
            "",
            *([f"- **File:** `{p.file}`" + (f" · cover `{p.cover}`" if p.cover else "")] if p.file else []),
            f"- **From the long video:** {source_range(p.clip)} ({p.clip.duration:.0f} s)"
            + (f" · chapter “{p.clip.chapter}”" if p.clip.chapter else ""),
            f"- **On-screen hook:** {p.hook}",
            f"- **Score:** {p.clip.score:.1f}",
            "",
            "**Title** (copy):",
            "",
            "```",
            p.title,
            "```",
            "",
            "**Description** (copy):",
            "",
            "```",
            p.description,
            "```",
            "",
        ]
    path.write_text("\n".join(lines), encoding="utf-8")


def write_report(path: Path, plans: list[ShortPlan], cands: list[Clip], settings: dict, n_words: int, n_sent: int) -> None:
    lines = ["# Shorts Factory report", "", "## Settings", ""]
    lines += [f"- {k}: {v}" for k, v in settings.items()]
    lines += [
        "",
        f"Transcript: {n_words} words, {n_sent} sentences, {len(cands)} candidate clips.",
        "",
        "Scores are the sum of the reasons below (+ helps, − hurts).",
        "",
        "## Picked",
        "",
    ]
    for p in plans:
        face = "" if p.face_found is None else (" · face found" if p.face_found else " · no face found, center crop")
        where = f"{source_range(p.clip)} · {p.clip.duration:.1f} s · score **{p.clip.score:.2f}**{face}"
        lines += [f"### {p.n}. {p.title}", "", where, "", f"> {p.clip.text[:400]}{'…' if len(p.clip.text) > 400 else ''}", ""]
        lines += [f"- {pts:+g} {why}" for pts, why in p.clip.reasons] + [""]
    picked = {(p.clip.start, p.clip.end) for p in plans}
    rest = [c for c in sorted(cands, key=lambda c: -c.score) if (c.start, c.end) not in picked]
    lines += ["## Runners-up (not picked: lower score or overlapping a pick)", ""]
    for c in rest[:10]:
        lines += [
            f"- **{c.score:.2f}** · {mmss(c.start)}–{mmss(c.end)} · “{c.sentences[0].text[:90]}” — "
            + "; ".join(f"{p:+g} {w}" for p, w in c.reasons)
        ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_import_json(path: Path, plans: list[ShortPlan], long_title: str, video_name: str, ch: Channel) -> None:
    """Matches the fields of a Short in Channel Studio (hook, range, onScreen, title, description, status)."""
    data = {
        "app": "channel-studio",
        "kind": "shorts-plan",
        "version": 1,
        "channel": ch.id,
        "video": {"title": long_title, "file": video_name},
        "shorts": [
            {
                "n": p.n,
                "channel": ch.id,
                "hook": spoken_hook(p.clip),
                "start": round(p.clip.start, 2),
                "end": round(p.clip.end, 2),
                "range": source_range(p.clip),
                "onScreen": p.hook,
                "title": p.title,
                "description": p.description,
                "status": "cut",
                "file": p.file,
                "cover": p.cover,
            }
            for p in plans
        ],
    }
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
