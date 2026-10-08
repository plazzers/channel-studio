"""Render two sample Shorts from the synthetic test video and save stills to
docs/screens/shorts-*.png (README pictures). Also screenshots the terminal output.

    python3 shorts_factory/tests/make_screens.py [--install]
Needs ffmpeg, Pillow, and (for the terminal pictures) Node + Playwright.
"""

import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHOTS = ROOT / "docs" / "screens"
sys.path.insert(0, str(HERE))
import make_test_video  # noqa: E402

WORK = HERE / "_work"
FACTORY = HERE.parent / "make_shorts.sh"


def run(args: list[str]) -> str:
    r = subprocess.run([str(FACTORY), *args], capture_output=True, text=True, check=True, cwd=WORK)
    return r.stdout


def shell_line(args: list[str]) -> str:
    return "$ ./make_shorts.sh " + " ".join(f'"{a}"' if " " in a else a for a in args)


def still(video: Path, t: float, out: Path, size=(540, 960)) -> None:
    tmp = out.with_suffix(".full.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1", str(tmp)], check=True)
    Image.open(tmp).resize(size, Image.LANCZOS).save(out, optimize=True)
    tmp.unlink()


def terminal_png(text: str, out: Path, title: str) -> None:
    """Draw `text` in a macOS-looking terminal window (Chromium via Playwright)."""
    if not shutil.which("node"):
        print("node not found: skipping", out.name)
        return
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    page = f"""<!doctype html><meta charset="utf-8"><style>
      body{{margin:0;background:#e9e6e1;padding:28px;font:15px/1.45 'DejaVu Sans Mono',monospace}}
      .win{{width:940px;border-radius:10px;overflow:hidden;box-shadow:0 12px 30px #0004;background:#1e1e1e}}
      .bar{{background:#3a3a3a;color:#ccc;font:13px sans-serif;padding:8px 12px;text-align:center;position:relative}}
      .dots{{position:absolute;left:12px;top:9px}}
      .dots i{{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:7px}}
      pre{{margin:0;padding:16px 18px;color:#e8e8e8;white-space:pre-wrap;font:inherit}}
      </style><div class="win"><div class="bar"><span class="dots"><i style="background:#ff5f57"></i>
      <i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
      {html.escape(title)}</div><pre>{html.escape(text)}</pre></div>"""
    page_file = WORK / (out.stem + ".html")
    page_file.write_text(page, encoding="utf-8")
    js = """const { chromium } = require('playwright');
      (async () => { const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 });
      // node -e: argv[1] is the first argument
      await p.goto('file://' + process.argv[1]); const el = await p.$('body');
      await p.setViewportSize({ width: 1000, height: 400 });
      await el.screenshot({ path: process.argv[2] }); await b.close(); })();"""
    subprocess.run(["node", "-e", js, str(page_file), str(out)], check=True, cwd=ROOT)


def install_screenshot() -> None:
    """Run install_mac.sh into a throw-away venv (model download skipped) and screenshot it."""
    venv = WORK / "install-venv"
    shutil.rmtree(venv, ignore_errors=True)
    env = {**os.environ, "SHORTS_FACTORY_VENV": str(venv), "SHORTS_FACTORY_SKIP_MODEL": "1"}
    r = subprocess.run([str(HERE.parent / "install_mac.sh")], capture_output=True, text=True, env=env, check=True)
    log = r.stdout.replace(str(venv), "~/.shorts-factory-venv").replace(str(HERE.parent), "~/channel-studio/shorts_factory")
    terminal_png("$ ./shorts_factory/install_mac.sh\n" + log, SHOTS / "shorts-terminal-install.png", "Terminal — install_mac.sh")


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    meta = make_test_video.make(WORK)
    if "--install" in sys.argv:
        install_screenshot()

    walter = WORK / "screens-walter"
    shutil.rmtree(walter, ignore_errors=True)
    args = [
        "test_video.mp4",
        "--channel",
        "walter",
        "--count",
        "5",
        "--chapters",
        "chapters.txt",
        "--transcript",
        "transcript.json",
        "--title",
        meta["title"],
        "--out",
        walter.name,
    ]
    cmd = shell_line(args) + "\n" + run(args).replace(str(WORK) + "/", "")
    terminal_png(cmd, SHOTS / "shorts-terminal-run.png", "Terminal — make_shorts.sh")

    plan = json.loads((walter / "channel-studio-import.json").read_text())
    best = max(plan["shorts"], key=lambda s: len(s["onScreen"]))  # a clip with a full hook bar
    mp4 = walter / best["file"]
    still(mp4, 1.2, SHOTS / "shorts-01-walter-hook.png")
    still(mp4, 6.0, SHOTS / "shorts-02-walter-captions.png")
    Image.open(walter / best["cover"]).resize((540, 960), Image.LANCZOS).save(SHOTS / "shorts-03-walter-cover.png", optimize=True)

    sal = WORK / "screens-sal"
    shutil.rmtree(sal, ignore_errors=True)
    run(
        [
            "test_video.mp4",
            "--channel",
            "sal",
            "--count",
            "1",
            "--mode",
            "blur",
            "--transcript",
            "transcript.json",
            "--title",
            "Restaurant Kitchen Secrets",
            "--out",
            sal.name,
        ]
    )
    s = json.loads((sal / "channel-studio-import.json").read_text())["shorts"][0]
    still(sal / s["file"], 1.2, SHOTS / "shorts-04-sal-blur-hook.png")
    still(sal / s["file"], 6.0, SHOTS / "shorts-05-sal-blur-captions.png")

    # Side-by-side overview for the README.
    tiles = [
        Image.open(SHOTS / f)
        for f in (
            "shorts-01-walter-hook.png",
            "shorts-02-walter-captions.png",
            "shorts-03-walter-cover.png",
            "shorts-04-sal-blur-hook.png",
        )
    ]
    sheet = Image.new("RGB", (len(tiles) * 270 + (len(tiles) + 1) * 12, 480 + 24), "#e9e6e1")
    for i, t in enumerate(tiles):
        sheet.paste(t.resize((270, 480), Image.LANCZOS), (12 + i * 282, 12))
    sheet.save(SHOTS / "shorts-00-overview.png", optimize=True)

    md = (walter / "SHORTS.md").read_text(encoding="utf-8").split("## 2.")[0].strip()
    terminal_png(md, SHOTS / "shorts-terminal-shorts-md.png", "SHORTS.md")
    print("Saved:", *sorted(p.name for p in SHOTS.glob("shorts-*.png")), sep="\n  ")


if __name__ == "__main__":
    main()
