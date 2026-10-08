"""make_shorts: the command-line entry point that runs the whole pipeline."""

import argparse
import shutil
import sys
import time
from pathlib import Path

from . import captions, metadata, moments, render
from .channels import CHANNELS, get_channel
from .transcribe import Word, load_transcript_file, sentences_from_words, transcribe

HARD_MAX = 58.0  # leaves room under YouTube's 60 s after rounding


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="make_shorts",
        description="Turn one long video into ready-to-post YouTube Shorts.",
        epilog='Example: make_shorts.sh "/Users/luka/Movies/Winter Checks.mp4" --channel walter',
    )
    p.add_argument("video", type=Path, help="the long video (mp4, mov, …)")
    p.add_argument("--channel", required=True, choices=sorted(CHANNELS), help="walter or sal")
    p.add_argument("--count", type=int, default=6, help="how many Shorts (default 6, max 10)")
    p.add_argument("--chapters", type=Path, help="text file with the YouTube chapter list (0:00 Title per line)")
    p.add_argument(
        "--mode",
        choices=["crop", "blur"],
        default="crop",
        help="crop = fill the screen, follow the face (default); blur = whole frame on a blurred background",
    )
    p.add_argument("--min", dest="min_len", type=float, default=20, help="shortest Short in seconds (default 20)")
    p.add_argument("--max", dest="max_len", type=float, default=55, help="longest Short in seconds (default 55)")
    p.add_argument("--lang", default="en", help="spoken language (default en)")
    p.add_argument("--model", default="small.en", help="speech model (default small.en; tiny.en is faster, medium.en better)")
    p.add_argument("--out", type=Path, help='output folder (default: "<video name> - SHORTS" next to the video)')
    p.add_argument("--title", help="title of the long video (default: the file name)")
    p.add_argument("--transcript", type=Path, help="use this transcript JSON instead of listening to the video")
    p.add_argument("--no-captions", action="store_true", help="don't burn in the word captions")
    p.add_argument("--plan-only", action="store_true", help="pick the moments and write the files, but don't render video")
    p.add_argument("--preset", default="medium", help=argparse.SUPPRESS)  # x264 speed (tests use ultrafast)
    a = p.parse_args(argv)
    if not 1 <= a.count <= 10:
        p.error("--count must be between 1 and 10")
    a.max_len = min(a.max_len, HARD_MAX)
    if a.min_len < 5 or a.min_len >= a.max_len:
        p.error(f"--min must be at least 5 and below --max ({a.max_len:g})")
    return a


def _shift(words: list[Word], start: float, end: float) -> list[Word]:
    return [Word(w.text, max(0.0, w.start - start), min(end, w.end) - start) for w in words if w.end > start and w.start < end]


def main(argv=None) -> int:
    a = parse_args(argv)
    t0 = time.time()
    video: Path = a.video.expanduser()
    if not video.is_file():
        print(f"Can't find the video: {video}", file=sys.stderr)
        return 2
    ch = get_channel(a.channel)
    long_title = a.title or video.stem
    out: Path = (a.out or video.parent / f"{video.stem} - SHORTS").expanduser()
    out.mkdir(parents=True, exist_ok=True)

    if not a.plan_only:
        problem = render.check_ffmpeg()
        if problem:
            print(problem, file=sys.stderr)
            return 3

    print(f"🎬 {video.name}  →  {out}")
    info = render.probe(video) if shutil.which("ffprobe") else None

    print("1/4 Transcript")
    if a.transcript:
        words, dur = load_transcript_file(a.transcript)
        print(f"  Using {a.transcript.name} ({len(words)} words).")
    else:
        words, dur = transcribe(video, out / "transcript.json", a.model, a.lang)
    video_end = (info.duration if info else 0) or dur or (words[-1].end if words else 0)
    sentences = sentences_from_words(words)
    if not sentences:
        print("No speech found in the video.", file=sys.stderr)
        return 4

    print("2/4 Picking moments")
    chapters = moments.parse_chapters(a.chapters.read_text(encoding="utf-8"), video_end) if a.chapters else None
    cands = moments.candidates(sentences, long_title, a.min_len, a.max_len, video_end, chapters)
    if not cands:
        print(f"No stretch of whole sentences lasts {a.min_len:g}–{a.max_len:g} s. Try --min 15 or --max 58.", file=sys.stderr)
        return 4
    picked = moments.pick(cands, a.count, chapters)
    if len(picked) < a.count:
        print(f"  Only {len(picked)} good, non-overlapping moments found (asked for {a.count}).")

    plans = []
    for i, clip in enumerate(picked, 1):
        hook = moments.hook_text(clip)
        plans.append(
            metadata.ShortPlan(
                i, clip, hook, metadata.make_title(clip, hook, long_title), metadata.make_description(clip, long_title, ch)
            )
        )
    metadata.unique_titles(plans)
    for p in plans:
        base = f"{p.n:02d} - {metadata.slug(p.title)}"
        p.file, p.cover = f"{base}.mp4", f"{base} - cover.jpg"
        print(f"  {p.n}. {metadata.source_range(p.clip):>13}  {p.clip.duration:4.0f} s  score {p.clip.score:5.1f}  {p.title}")

    if not a.plan_only:
        print(f"3/4 Rendering {len(plans)} Shorts ({a.mode} mode)")
        for p in plans:
            c = p.clip
            t1 = time.time()
            crop = render.crop_plan(video, info, c.start, c.end) if a.mode == "crop" else None
            p.face_found = crop.face_found if crop else None
            ass = captions.short_ass(_shift(c.words, c.start, c.end), p.hook, ch, c.duration, captions=not a.no_captions)
            render.render_short(video, info, c.start, c.end, ass, out / p.file, a.mode, crop.filter() if crop else "", a.preset)
            at = min(1.0, c.duration / 2)
            render.render_cover(
                video, c.start + at, captions.cover_ass(p.hook, ch), out / p.cover, a.mode, crop.filter_at(at) if crop else ""
            )
            print(f"  ✓ {p.file}  ({time.time() - t1:.0f} s)")
    else:
        for p in plans:
            p.file = p.cover = ""

    print("4/4 Writing titles and descriptions")
    metadata.write_csv(out / "shorts.csv", plans)
    metadata.write_markdown(out / "SHORTS.md", plans, long_title, ch)
    settings = {
        "video": video.name,
        "title": long_title,
        "channel": ch.name,
        "count": a.count,
        "mode": a.mode,
        "length": f"{a.min_len:g}–{a.max_len:g} s",
        "model": "fixture" if a.transcript else a.model,
        "chapters": len(chapters) if chapters else "none",
    }
    metadata.write_report(out / "report.md", plans, cands, settings, len(words), len(sentences))
    metadata.write_import_json(out / "channel-studio-import.json", plans, long_title, video.name, ch)
    print(f"✅ Done in {time.time() - t0:.0f} s. Open SHORTS.md in:\n   {out}")
    return 0
