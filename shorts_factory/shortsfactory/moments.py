"""Find the best 20–55 s moments in a transcript.

Every score is a sum of small, named heuristics so the report can show
exactly why a clip was picked.
"""

import re
from dataclasses import dataclass, field

from .transcribe import Sentence

STOPWORDS = set(
    """a an the and or but so to of in on at for with by from as is are was were be been being it its
    this that these those i you your yours we our they their he she him her them me my mine us do does
    did done have has had not no yes if then than there here what which who whom when where why how
    all any some more most just very can could will would should may might must about into over out up
    down off again once also only own same too s t don't it's that's i'm you're we're they're here's
    let's get got go going one thing things way really like know video today before after every
    never because while until much many each other something anything""".split()
)
SMALL_WORDS = {"a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "at", "by", "vs"}
FILLER_START = {"so", "and", "but", "okay", "ok", "now", "well", "alright", "look", "listen", "right", "um", "uh"}
NUMBER_WORDS = set(
    """two three four five six seven eight nine ten eleven twelve thirteen fifteen twenty thirty forty
    fifty hundred thousand million percent dollars first second third half double""".split()
)
HOOK_PHRASES = {
    "never": 1.5,
    "most people": 2.0,
    "mistake": 1.5,
    "mistakes": 1.5,
    "check": 1.0,
    "don't": 1.0,
    "here's": 1.5,
    "stop": 1.0,
    "nobody": 1.0,
    "secret": 1.0,
    "worst": 1.0,
    "biggest": 1.0,
    "wrong": 1.0,
    "before you": 1.0,
    "always": 0.5,
    "warning": 1.0,
    "truth": 0.5,
}
BAD_START = {
    "as i said": 3.0,
    "as i mentioned": 3.0,
    "like i said": 3.0,
    "like i mentioned": 3.0,
    "next": 2.5,
    "in this video": 3.0,
    "now the next": 2.5,
    "moving on": 2.5,
    "number two": 1.0,
    "number three": 1.0,
}
WEAK_START = {"and", "but", "so", "also", "because", "which", "then", "or"}
CONTEXT_START = {"it", "this", "that", "they", "these", "those", "he", "she", "there"}
INTRO_PHRASES = (
    "welcome back",
    "welcome to",
    "in this video",
    "today we",
    "today i",
    "let's get started",
    "before we start",
    "before we get started",
    "let's dive in",
    "let's jump in",
)
OUTRO_PHRASES = (
    "thanks for watching",
    "thank you for watching",
    "see you next",
    "see you in the next",
    "subscribe",
    "until next time",
    "take care of your home",
    "mangia bene",
    "that's it for",
    "hit the like",
    "new videos every week",
)
PLUG_PHRASES = (
    "link in the description",
    "first link",
    "description below",
    "in the description",
    "checklist",
    "free pdf",
    "cookbook",
    "sponsor",
    "use code",
    "patreon",
    "payhip",
    "grab it",
    "download it",
    "my guide",
    "my book",
    "my app",
    "discount",
    "link below",
)


def norm_words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9$%']+", text.lower().replace("’", "'")) if w.strip("'")]


def stem(w: str) -> str:
    w = w.strip("'")
    for suf in ("ing", "es", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def keywords(text: str) -> list[str]:
    """Content words of a title, in order, without repeats."""
    out = []
    for w in norm_words(text):
        if w not in STOPWORDS and len(w) > 2 and not w.isdigit() and stem(w) not in [stem(x) for x in out]:
            out.append(w)
    return out


def has_phrase(words: list[str], phrase: str) -> bool:
    p = phrase.split()
    return any(words[i : i + len(p)] == p for i in range(len(words) - len(p) + 1))


@dataclass
class Chapter:
    start: float
    end: float
    title: str


def parse_chapters(text: str, video_duration: float | None = None) -> list[Chapter]:
    """Parse a YouTube chapter list: one '0:00 Title' (or '1:02:03 - Title') per line."""
    found = []
    for line in text.splitlines():
        m = re.match(r"^\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*[-–—:|.)]*\s*(.+?)\s*$", line)
        if m:
            h, mnt, sec, title = m.groups()
            found.append((int(h or 0) * 3600 + int(mnt) * 60 + int(sec), title))
    found.sort()
    end_default = video_duration or float("inf")
    return [Chapter(s, found[i + 1][0] if i + 1 < len(found) else end_default, t) for i, (s, t) in enumerate(found)]


@dataclass
class Clip:
    start: float
    end: float
    sentences: list[Sentence]
    score: float = 0.0
    reasons: list[tuple[float, str]] = field(default_factory=list)
    chapter: str = ""
    crosses_chapter: bool = False

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.sentences)

    @property
    def words(self):
        return [w for s in self.sentences for w in s.words]

    def add(self, points: float, why: str) -> None:
        if points:
            self.score += points
            self.reasons.append((round(points, 2), why))


def _score(clip: Clip, title_kw: list[str], video_end: float, chapter_kw: list[str]) -> None:
    first = clip.sentences[0].text
    fw = norm_words(first)
    all_w = norm_words(clip.text)

    # 1. Strong first sentence
    if any(w.isdigit() or w.startswith("$") or w.endswith("%") or w in NUMBER_WORDS for w in fw):
        clip.add(2.0, "first sentence has a number")
    hook_hits = [p for p in HOOK_PHRASES if has_phrase(fw, p)]
    if hook_hits:
        clip.add(min(3.0, sum(HOOK_PHRASES[p] for p in hook_hits)), "hook words: " + ", ".join(f'"{p}"' for p in hook_hits))
    if first.rstrip().endswith("?"):
        clip.add(1.5, "opens with a question")
    if 4 <= len(fw) <= 16:
        clip.add(0.5, "short, punchy first sentence")
    elif len(fw) > 28:
        clip.add(-1.0, "very long first sentence")

    # 2. Self-contained
    bad = [p for p in BAD_START if " ".join(fw[: len(p.split())]) == p]
    if bad:
        clip.add(-max(BAD_START[p] for p in bad), f'starts mid-thought ("{bad[0]}")')
    elif fw and fw[0] in WEAK_START:
        clip.add(-1.0, f'starts with "{fw[0]}"')
    elif fw and fw[0] in CONTEXT_START and len(fw) > 1 and fw[1] not in {"is", "'s"}:
        clip.add(-0.5, f'starts with "{fw[0]}" (may need earlier context)')
    last = clip.sentences[-1].text.rstrip()
    if re.search(r"[.!]['\")]*$", last):
        clip.add(1.0, "ends on a complete thought")
    elif last.endswith("?"):
        clip.add(-1.0, "ends on a question (answer is cut off)")
    else:
        clip.add(-1.5, "ends mid-sentence")
    if any(has_phrase(norm_words(last), p) for p in ("next", "but first", "coming up", "in a minute")):
        clip.add(-1.0, "ends by pointing to what comes next")

    # 3. Energy
    wps = len(clip.words) / max(clip.duration, 1)
    energy = max(-2.0, min(2.0, (wps - 2.3) * 2))
    clip.add(round(energy, 2), f"{wps:.1f} words per second")

    # 4. Keyword overlap with the long video's title (and chapter title)
    stems = {stem(w) for w in all_w}
    hits = [k for k in title_kw if stem(k) in stems]
    if hits:
        clip.add(min(3.0, 0.8 * len(hits)), "title keywords: " + ", ".join(hits))
    ch_hits = [k for k in chapter_kw if stem(k) in stems and k not in hits]
    if ch_hits:
        clip.add(min(1.5, 0.5 * len(ch_hits)), "chapter keywords: " + ", ".join(ch_hits))

    # 5. Intro / outro / plugs
    if clip.start < 20:
        clip.add(-5.0, "inside the first 20 seconds (intro)")
    intro = [p for p in INTRO_PHRASES if has_phrase(all_w, p)]
    if intro:
        clip.add(-2.5, f'intro talk ("{intro[0]}")')
    outro = [p for p in OUTRO_PHRASES if has_phrase(all_w, p)]
    if outro:
        clip.add(-3.0, f'outro talk ("{outro[0]}")')
    if video_end and clip.end > video_end - 25:
        clip.add(-2.0, "in the last 25 seconds (outro)")
    plugs = [p for p in PLUG_PHRASES if has_phrase(all_w, p)]
    if plugs:  # links aren't clickable in a Short, so any plug hurts the same
        clip.add(-6.0, "product plug / link talk: " + ", ".join(f'"{p}"' for p in plugs))

    # 6. Length
    if 30 <= clip.duration <= 45:
        clip.add(0.5, "good length (30–45 s)")
    elif clip.duration < 25:
        clip.add(-0.5, "on the short side")


def candidates(
    sentences: list[Sentence],
    title: str,
    min_len: float = 20,
    max_len: float = 55,
    video_end: float | None = None,
    chapters: list[Chapter] | None = None,
) -> list[Clip]:
    """Every run of whole sentences that lasts between min_len and max_len seconds, scored."""
    if not sentences:
        return []
    video_end = video_end or sentences[-1].end
    title_kw = keywords(title)
    out = []
    for i in range(len(sentences)):
        for j in range(i, len(sentences)):
            start = max(0.0, sentences[i].start - 0.12)
            end = min(video_end, sentences[j].end + 0.35)
            dur = end - start
            if dur > max_len:
                break
            if dur < min_len:
                continue
            clip = Clip(start, end, sentences[i : j + 1])
            ch = None
            if chapters:
                ch = next((c for c in chapters if c.start <= sentences[i].start < c.end), None)
                clip.chapter = ch.title if ch else ""
            _score(clip, title_kw, video_end, keywords(ch.title) if ch else [])
            if ch and sentences[j].end > ch.end + 1:
                clip.crosses_chapter = True
                clip.add(-1.5, "runs into the next chapter")
            out.append(clip)
    return out


def _overlaps(a: Clip, chosen: list[Clip], gap: float = -0.3) -> bool:
    """True if `a` overlaps a chosen clip (the 0.3 s padding at clip edges may touch)."""
    return any(a.start < c.end + gap and c.start < a.end + gap for c in chosen)


def pick(
    cands: list[Clip], count: int, chapters: list[Chapter] | None = None, chapter_floor: float = 0.0, floor: float = -2.0
) -> list[Clip]:
    """Top `count` non-overlapping clips scoring above `floor`. With chapters: first the
    best clip of each chapter (if it scores above `chapter_floor`), then the best of the rest."""
    ranked = sorted(cands, key=lambda c: (-c.score, c.start))
    chosen: list[Clip] = []
    if chapters:
        best_per_chapter = {}
        for c in ranked:
            if c.chapter and c.chapter not in best_per_chapter and c.score > chapter_floor:
                best_per_chapter[c.chapter] = c
        # A chapter's best may overlap another chapter's; retry with its next best.
        # Clips that stay inside their chapter go first; a chapter's best may overlap
        # another chapter's pick, so fall back to its next best.
        for ch_title in sorted(best_per_chapter, key=lambda t: -best_per_chapter[t].score):
            if len(chosen) >= count:
                break
            mine = [c for c in ranked if c.chapter == ch_title and c.score > chapter_floor]
            for c in [c for c in mine if not c.crosses_chapter] + [c for c in mine if c.crosses_chapter]:
                if not _overlaps(c, chosen):
                    chosen.append(c)
                    break
    for c in ranked:
        if len(chosen) >= count:
            break
        if c.score > floor and not _overlaps(c, chosen) and c not in chosen:
            chosen.append(c)
    return sorted(chosen, key=lambda c: c.start)


def title_case(words: list[str]) -> str:
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i and lw in SMALL_WORDS:
            out.append(lw)
        elif w.isupper() and len(w) > 1:
            out.append(w)  # keep acronyms like "HVAC"
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


HOOK_TRIM = STOPWORDS | {"because", "when", "while", "until"}


def hook_text(clip: Clip, max_words: int = 6) -> str:
    """≤ 6 title-case words from the clip's first sentence."""
    first = clip.sentences[0].text
    raw = [re.sub(r"^[^\w$']+|[^\w%']+$", "", w) for w in first.split()]
    raw = [w for w in raw if w]
    while len(raw) > 2 and raw[0].lower() in FILLER_START:
        raw.pop(0)
    question = first.rstrip().endswith("?") and len(raw) <= max_words
    words = raw[:max_words]
    if len(raw) > max_words:
        while len(words) > 3 and words[-1].lower() in HOOK_TRIM:
            words.pop()
    return title_case(words) + ("?" if question else "")
