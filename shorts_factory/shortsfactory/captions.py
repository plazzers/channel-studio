"""ASS subtitle files (rendered by ffmpeg/libass): word-timed captions,
the hook bar for the first seconds, and the cover text."""

import re

from .channels import Channel, ass_color
from .transcribe import Word

W, H = 1080, 1920
FONT = "Anton"
CAPTION_SIZE = 138
CAPTION_MAX_CHARS = 14
CAPTION_MARGIN_V = 520  # bottom of the caption sits at y≈1400: above YouTube's title/buttons
HOOK_SECONDS = 2.5
WHITE = "&H00FFFFFF"
INK = "&H00101010"


def _t(sec: float) -> str:
    cs = max(0, int(round(sec * 100)))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def _esc(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def _header(styles: list[str]) -> str:
    return "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            f"PlayResX: {W}",
            f"PlayResY: {H}",
            "WrapStyle: 0",
            "ScaledBorderAndShadow: yes",
            "YCbCr Matrix: TV.709",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
            "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV, Encoding",
            *styles,
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
    )


def _style(name, size, primary, outline_col, border_style, outline, align, margin_v, margin_lr=90, back="&H00000000", spacing=1):
    return (
        f"Style: {name},{FONT},{size},{primary},{primary},{outline_col},{back},0,0,0,0,100,100,{spacing},0,"
        f"{border_style},{outline},0,{align},{margin_lr},{margin_lr},{margin_v},1"
    )


def _hook_styles(ch: Channel, size: int, margin_v: int, align: int = 8) -> list[str]:
    # Two opaque boxes: a slightly bigger accent box behind the dark bar = an accent frame.
    return [
        _style("HookFrame", size, ass_color(ch.accent, 0xFF), ass_color(ch.accent), 3, 34, align, margin_v, 110),
        _style("Hook", size, ass_color(ch.light), ass_color(ch.bar), 3, 26, align, margin_v, 110),
    ]


def _clean_caption_word(text: str) -> str:
    return re.sub(r"[,.;:\"“”]+", "", text).upper().strip()


def group_words(
    words: list[Word], max_words: int = 3, max_chars: int = CAPTION_MAX_CHARS, max_gap: float = 0.35
) -> list[list[Word]]:
    """1–3 words per caption; break on punctuation, pauses and width."""
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for w in words:
        if not _clean_caption_word(w.text):
            continue
        if cur:
            width = len(" ".join(_clean_caption_word(x.text) for x in cur + [w]))
            if len(cur) >= max_words or width > max_chars or w.start - cur[-1].end > max_gap:
                groups.append(cur)
                cur = []
        cur.append(w)
        if re.search(r"[.,!?;:]['\")]*$", w.text):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def caption_events(words: list[Word], ch: Channel, clip_end: float) -> list[str]:
    accent = ass_color(ch.accent)
    events = []
    groups = group_words(words)
    for gi, g in enumerate(groups):
        nxt = groups[gi + 1][0].start if gi + 1 < len(groups) else clip_end
        g_end = min(nxt, g[-1].end + 0.6)
        texts = [_esc(_clean_caption_word(w.text)) for w in g]
        size = CAPTION_SIZE
        est = len(" ".join(texts)) * CAPTION_SIZE * 0.5
        if est > W - 180:
            size = int(CAPTION_SIZE * (W - 180) / est)
        for k, w in enumerate(g):
            start = g[0].start if k == 0 else w.start
            end = g[k + 1].start if k + 1 < len(g) else g_end
            if end - start < 0.02:
                continue
            parts = [f"{{\\c{accent}}}{t}{{\\c{WHITE}}}" if j == k else t for j, t in enumerate(texts)]
            pop = "\\fscx108\\fscy108\\t(0,90,\\fscx100\\fscy100)" if k == 0 else ""
            fs = f"\\fs{size}" if size != CAPTION_SIZE else ""
            events.append(f"Dialogue: 0,{_t(start)},{_t(end)},Cap,,0,0,0,,{{{pop}{fs}}}{' '.join(parts)}")
    return events


def hook_events(hook: str, start: float, end: float, fade=(120, 250)) -> list[str]:
    text = _esc(hook)
    fad = f"{{\\fad({fade[0]},{fade[1]})}}" if fade else ""
    return [
        f"Dialogue: 0,{_t(start)},{_t(end)},HookFrame,,0,0,0,,{fad}{text}",
        f"Dialogue: 1,{_t(start)},{_t(end)},Hook,,0,0,0,,{fad}{text}",
    ]


def short_ass(words: list[Word], hook: str, ch: Channel, duration: float, captions: bool = True) -> str:
    """Words must already be shifted so the clip starts at 0."""
    styles = [_style("Cap", CAPTION_SIZE, WHITE, INK, 1, 10, 2, CAPTION_MARGIN_V)] + _hook_styles(ch, 104, 250)
    events = caption_events(words, ch, duration) if captions else []
    events += hook_events(hook, 0, min(HOOK_SECONDS, duration))
    return _header(styles) + "\n" + "\n".join(events) + "\n"


def cover_ass(hook: str, ch: Channel) -> str:
    styles = _hook_styles(ch, 132, 430)
    return _header(styles) + "\n" + "\n".join(hook_events(hook.upper(), 0, 3600, fade=None)) + "\n"
