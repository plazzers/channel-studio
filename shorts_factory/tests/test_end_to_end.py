"""End-to-end: build the synthetic 3-minute video, run make_shorts on it, and
check every output. Takes a few minutes (it really renders the Shorts).

    python3 -m unittest discover -s shorts_factory/tests
"""

import csv
import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import make_test_video  # noqa: E402

from shortsfactory import captions, cli, moments, render  # noqa: E402
from shortsfactory.channels import get_channel  # noqa: E402
from shortsfactory.transcribe import Word, load_transcript_file  # noqa: E402

WORK = HERE / "_work"
COUNT = 5

try:
    import numpy as np
except ImportError:  # numpy comes with opencv; without it the pixel checks are skipped
    np = None

HAVE_FFMPEG = bool(shutil.which("ffmpeg")) and render.check_ffmpeg() is None


def ffprobe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def frame(path: Path, t: float, crop: str | None = None):
    """One RGB frame (optionally a region 'w:h:x:y') as a numpy array."""
    vf = ["-vf", f"crop={crop}"] if crop else []
    w, h = (int(crop.split(":")[0]), int(crop.split(":")[1])) if crop else (1080, 1920)
    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-ss",
            f"{t:.2f}",
            "-i",
            str(path),
            *vf,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(int)


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg with libass is needed")
class TestEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta = make_test_video.make(WORK)
        cls.video = Path(cls.meta["video"])
        cls.out = WORK / "out-walter"
        if cls.out.exists():
            shutil.rmtree(cls.out)
        code = cli.main(
            [
                str(cls.video),
                "--channel",
                "walter",
                "--count",
                str(COUNT),
                "--transcript",
                cls.meta["transcript"],
                "--chapters",
                cls.meta["chapters"],
                "--title",
                cls.meta["title"],
                "--out",
                str(cls.out),
                "--preset",
                "ultrafast",
            ]
        )
        assert code == 0
        cls.plan = json.loads((cls.out / "channel-studio-import.json").read_text())

    def test_test_video_is_3_min_16x9(self):
        info = render.probe(self.video)
        self.assertEqual((info.width, info.height), (1920, 1080))
        self.assertGreaterEqual(info.duration, 179)
        self.assertTrue(info.has_audio)

    def test_n_outputs(self):
        self.assertEqual(len(sorted(self.out.glob("*.mp4"))), COUNT)
        self.assertEqual(len(sorted(self.out.glob("*cover.jpg"))), COUNT)
        self.assertEqual(len(self.plan["shorts"]), COUNT)

    def test_each_short_format(self):
        for mp4 in sorted(self.out.glob("*.mp4")):
            with self.subTest(mp4.name):
                info = ffprobe(mp4)
                v = next(s for s in info["streams"] if s["codec_type"] == "video")
                a = [s for s in info["streams"] if s["codec_type"] == "audio"]
                self.assertEqual((v["width"], v["height"]), (1080, 1920))
                self.assertEqual(v["codec_name"], "h264")
                self.assertTrue(a and a[0]["codec_name"] == "aac", "audio present")
                self.assertTrue(20 <= float(info["format"]["duration"]) <= 60)

    def test_audio_is_not_silent(self):
        if not self.meta["speech"]:
            self.skipTest("no espeak-ng: test audio is a hum")
        mp4 = sorted(self.out.glob("*.mp4"))[0]
        r = subprocess.run(["ffmpeg", "-i", str(mp4), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
        mean = float(r.stderr.split("mean_volume:")[1].split("dB")[0])
        self.assertGreater(mean, -35)

    def test_covers(self):
        for jpg in self.out.glob("*cover.jpg"):
            v = ffprobe(jpg)["streams"][0]
            self.assertEqual((v["width"], v["height"]), (1080, 1920))

    def test_no_overlap_and_no_intro_or_outro(self):
        spans = sorted((s["start"], s["end"]) for s in self.plan["shorts"])
        for (_, e1), (s2, _) in zip(spans, spans[1:]):
            self.assertGreater(s2, e1 - 0.31)  # the 0.3 s edge padding may touch, nothing more
        texts = " ".join(s["description"] for s in self.plan["shorts"]).lower()
        self.assertNotIn("thanks for watching", texts)
        self.assertNotIn("welcome back", texts)

    def test_csv_md_json(self):
        with (self.out / "shorts.csv").open(encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), COUNT)
        md = (self.out / "SHORTS.md").read_text(encoding="utf-8")
        report = (self.out / "report.md").read_text(encoding="utf-8")
        title_kw = moments.keywords(self.meta["title"])
        for row, s in zip(rows, self.plan["shorts"]):
            with self.subTest(row["title"]):
                self.assertLessEqual(len(row["title"]), 100)
                title_stems = {moments.stem(w) for w in moments.norm_words(row["title"])}
                self.assertTrue(any(moments.stem(k) in title_stems for k in title_kw), "title has a keyword")
                self.assertIn(row["title"], md)
                self.assertIn(row["title"], report)
                self.assertTrue((self.out / row["file"]).exists())
                self.assertIn("FREE checklist: https://payhip.com/b/hiIm1", row["description"])
                self.assertIn("#shorts", row["description"])
                self.assertTrue(row["reasons"])
                self.assertEqual(s["status"], "cut")
                self.assertLessEqual(len(s["onScreen"].split()), 6)
                self.assertLessEqual(len(s["hook"].split()), 12)
                for key in ("hook", "range", "onScreen", "title", "description", "start", "end"):
                    self.assertIn(key, s)

    @unittest.skipIf(np is None, "numpy missing")
    def test_captions_and_hook_are_burned_in(self):
        s = self.plan["shorts"][0]
        mp4 = self.out / s["file"]
        words, _ = load_transcript_file(Path(self.meta["transcript"]))
        start, end = s["start"], min(s["end"], s["start"] + 6)
        shifted = [Word(w.text, w.start - start, w.end - start) for w in words if start <= w.start < end]
        ch = get_channel("walter")
        bare = WORK / "no-captions.mp4"
        info = render.probe(self.video)
        crop = render.crop_plan(self.video, info, s["start"], s["end"])  # same crop as the real Short
        ass = captions.short_ass(shifted, s["onScreen"], ch, end - start, captions=False)
        render.render_short(self.video, info, start, end, ass, bare, "crop", crop.filter(), "ultrafast")
        # Caption zone, after the hook bar is gone: big difference with vs. without captions.
        zone = "1080:330:0:1070"
        t = 3.5
        diff = np.abs(frame(mp4, t, zone) - frame(bare, t, zone)).mean()
        self.assertGreater(diff, 8, "captions should change the caption zone")
        # Same frame outside the caption zone: (almost) identical.
        top = "1080:500:0:600"
        self.assertLess(np.abs(frame(mp4, t, top) - frame(bare, t, top)).mean(), 4)
        # Hook bar at the top in the first 2.5 s: lots of navy pixels, gone later.
        navy = np.array([0x1C, 0x2B, 0x3A])

        def navy_share(img):
            return (np.abs(img - navy).sum(axis=2) < 40).mean()

        self.assertGreater(navy_share(frame(mp4, 1.0, "1080:300:0:180")), 0.1)
        self.assertLess(navy_share(frame(mp4, 3.5, "1080:300:0:180")), 0.02)

    def test_crop_follows_face(self):
        if not self.meta["has_face"]:
            self.skipTest("no OpenCV: test video has no face")
        info = render.probe(self.video)
        report = (self.out / "report.md").read_text(encoding="utf-8")
        self.assertNotIn("no face found", report)
        for s in self.plan["shorts"]:
            plan = render.crop_plan(self.video, info, s["start"], s["end"])
            self.assertTrue(plan.face_found)
            for t in (2.0, (s["end"] - s["start"]) / 2):
                want = make_test_video.face_center_x(s["start"] + t, self.meta["duration"])
                got = plan.x_at(t) + plan.w / 2
                self.assertAlmostEqual(got, want, delta=60, msg=f"{s['range']} at {t:.0f}s")

    def test_blur_mode_and_sal(self):
        out = WORK / "out-sal-blur"
        if out.exists():
            shutil.rmtree(out)
        code = cli.main(
            [
                str(self.video),
                "--channel",
                "sal",
                "--count",
                "1",
                "--mode",
                "blur",
                "--min",
                "20",
                "--max",
                "30",
                "--transcript",
                self.meta["transcript"],
                "--out",
                str(out),
                "--preset",
                "ultrafast",
                "--title",
                "Restaurant Gutters",
            ]
        )
        self.assertEqual(code, 0)
        mp4 = next(out.glob("*.mp4"))
        v = next(s for s in ffprobe(mp4)["streams"] if s["codec_type"] == "video")
        self.assertEqual((v["width"], v["height"]), (1080, 1920))
        with (out / "shorts.csv").open(encoding="utf-8") as f:
            row = next(csv.DictReader(f))
        self.assertIn("FREE 25 Rules for Eating Out: https://payhip.com/b/dnY7F", row["description"])

    def test_cli_errors(self):
        self.assertEqual(cli.main([str(WORK / "missing.mp4"), "--channel", "walter"]), 2)
        with self.assertRaises(SystemExit):
            cli.main([str(self.video), "--channel", "walter", "--count", "11"])


if __name__ == "__main__":
    unittest.main()
