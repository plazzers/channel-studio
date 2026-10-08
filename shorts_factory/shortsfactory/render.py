"""ffmpeg rendering: 1080x1920 H.264/AAC Shorts and JPG covers."""

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import face
from .captions import H, W

FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"


class FFmpegError(RuntimeError):
    pass


@dataclass
class VideoInfo:
    width: int
    height: int
    duration: float
    has_audio: bool


def check_ffmpeg() -> str | None:
    """Return a problem description, or None when ffmpeg is usable."""
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            return f"'{tool}' is not installed. On the Mac run: brew install ffmpeg"
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    if not any(line.split()[1:2] == ["ass"] for line in out.splitlines() if line.strip()):
        return (
            "Your ffmpeg can't draw captions (it was built without libass).\n"
            "  Fix: brew uninstall ffmpeg && brew tap homebrew-ffmpeg/ffmpeg && brew install homebrew-ffmpeg/ffmpeg/ffmpeg"
        )
    return None


def probe(path: Path) -> VideoInfo:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True,
        text=True,
    )
    if r.returncode:
        raise FFmpegError(f"Can't read the video {path}: {r.stderr.strip()}")
    data = json.loads(r.stdout)
    v = next((s for s in data["streams"] if s.get("codec_type") == "video"), None)
    if not v:
        raise FFmpegError(f"No video picture found in {path}")
    w, h = int(v["width"]), int(v["height"])
    rot = int((v.get("tags") or {}).get("rotate", 0) or 0)
    for sd in v.get("side_data_list", []) or []:
        rot = int(sd.get("rotation", rot) or rot)
    if abs(rot) in (90, 270):
        w, h = h, w
    return VideoInfo(
        width=w,
        height=h,
        duration=float(data["format"].get("duration") or v.get("duration") or 0),
        has_audio=any(s.get("codec_type") == "audio" for s in data["streams"]),
    )


def _even(x: float) -> int:
    return int(round(x / 2)) * 2


def _crop_x_expr(keys: list[tuple[float, float]]) -> str:
    """Piecewise-linear expression of t through (t, x) keyframes."""
    if len(keys) == 1:
        return f"{keys[0][1]:.1f}"
    expr = f"{keys[-1][1]:.1f}"
    for (t0, x0), (t1, x1) in reversed(list(zip(keys, keys[1:]))):
        seg = f"{x0:.1f}+({x1 - x0:.1f})*(t-{t0:.2f})/{t1 - t0:.2f}"
        expr = f"if(lt(t,{t1:.2f}),{seg},{expr})"
    return f"if(lt(t,{keys[0][0]:.2f}),{keys[0][1]:.1f},{expr})"


@dataclass
class CropPlan:
    """A 9:16 window of the source; x follows the face through `keys` (clip time, left x)."""

    w: int
    h: int
    y: int
    keys: list[tuple[float, float]]
    face_found: bool

    def filter(self) -> str:
        return f"crop=w={self.w}:h={self.h}:x='{_crop_x_expr(self.keys)}':y={self.y}"

    def x_at(self, t: float) -> float:
        keys = self.keys
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, x0), (t1, x1) in zip(keys, keys[1:]):
            if t < t1:
                return x0 + (x1 - x0) * (t - t0) / (t1 - t0)
        return keys[-1][1]

    def filter_at(self, t: float) -> str:
        return f"crop=w={self.w}:h={self.h}:x={self.x_at(t):.1f}:y={self.y}"


def crop_plan(video: Path, info: VideoInfo, start: float, end: float) -> CropPlan:
    """9:16 crop that follows the face (center when no face is found)."""
    if info.width / info.height <= W / H:  # already tall: crop height, keep center
        ch = _even(info.width * H / W)
        return CropPlan(info.width, ch, (info.height - ch) // 2, [(0.0, 0.0)], False)
    cw = _even(info.height * W / H)
    centers = face.track(video, start, end, info.width, info.height)
    found = centers is not None
    if not found:
        centers = [(0.0, info.width / 2)]
    keys = [(t, round(max(0.0, min(info.width - cw, cx - cw / 2)), 1)) for t, cx in centers]
    return CropPlan(cw, info.height, 0, keys, found)


def _frame_filter(mode: str, crop: str) -> str:
    if mode == "blur":
        return (
            "[0:v]split=2[a][b];"
            f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},scale=270:480,"
            f"boxblur=10:2,scale={W}:{H},eq=brightness=-0.07:saturation=0.85[bg];"
            f"[b]scale={W}:-2:flags=lanczos[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
        )
    return f"[0:v]{crop},scale={W}:{H}:flags=lanczos,setsar=1"


def _run(cmd: list[str], cwd: Path) -> None:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise FFmpegError("ffmpeg failed:\n" + "\n".join(r.stderr.strip().splitlines()[-15:]))


def _workdir(ass_text: str) -> tempfile.TemporaryDirectory:
    """Temp folder with captions.ass and the fonts, so filter paths never need escaping."""
    tmp = tempfile.TemporaryDirectory(prefix="shorts-")
    d = Path(tmp.name)
    (d / "captions.ass").write_text(ass_text, encoding="utf-8")
    shutil.copytree(FONTS_DIR, d / "fonts")
    return tmp


def render_short(
    video: Path,
    info: VideoInfo,
    start: float,
    end: float,
    ass_text: str,
    out: Path,
    mode: str = "crop",
    crop: str = "",
    preset: str = "medium",
) -> None:
    dur = end - start
    graph = _frame_filter(mode, crop) + ",ass=captions.ass:fontsdir=fonts[v]"
    audio_in: list[str] = []
    if info.has_audio:
        graph += ";[0:a:0]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
    else:
        audio_in = ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    with _workdir(ass_text) as tmp:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{dur:.3f}",
            "-i",
            str(video.resolve()),
            *audio_in,
            "-filter_complex",
            graph,
            "-map",
            "[v]",
            "-map",
            "[a]" if info.has_audio else "1:a",
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            "20",
            "-profile:v",
            "high",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            "-t",
            f"{dur:.3f}",
            str(out.resolve()),
        ]
        _run(cmd, Path(tmp))


def render_cover(video: Path, at: float, ass_text: str, out: Path, mode: str = "crop", crop: str = "") -> None:
    graph = _frame_filter(mode, crop) + ",ass=captions.ass:fontsdir=fonts[v]"
    with _workdir(ass_text) as tmp:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{at:.3f}",
            "-i",
            str(video.resolve()),
            "-filter_complex",
            graph,
            "-map",
            "[v]",
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out.resolve()),
        ]
        _run(cmd, Path(tmp))
