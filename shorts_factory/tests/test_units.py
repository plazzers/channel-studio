"""Fast unit tests (no video needed). Run: python3 -m unittest discover -s shorts_factory/tests"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shortsfactory import captions, face, metadata, moments, transcribe  # noqa: E402
from shortsfactory.channels import CHANNELS, ass_color, get_channel  # noqa: E402
from shortsfactory.render import CropPlan, _crop_x_expr  # noqa: E402
from shortsfactory.transcribe import Word, sentences_from_words  # noqa: E402


def words_from(text: str, start: float = 0.0, wps: float = 2.6) -> list[Word]:
    out, t = [], start
    for sentence in text.split("|"):
        for w in sentence.split():
            out.append(Word(w, t, t + 0.8 / wps))
            t += 1 / wps
        t += 0.4
    return out


class TestSentences(unittest.TestCase):
    def test_split_on_punctuation_and_pauses(self):
        ws = words_from("Hello there friend.|Next one here?|No punctuation at all")
        ss = sentences_from_words(ws)
        self.assertEqual([s.text for s in ss], ["Hello there friend.", "Next one here?", "No punctuation at all"])

    def test_long_sentence_is_split(self):
        ws = words_from(" ".join(["word,"] + ["word"] * 79), wps=2.5)
        ss = sentences_from_words(ws)
        self.assertGreater(len(ss), 1)
        self.assertTrue(all(s.end - s.start <= transcribe.MAX_SENTENCE_SEC + 0.5 for s in ss))


class TestMoments(unittest.TestCase):
    TITLE = "9 Things to Check Before Winter"

    def _sentences(self):
        text = (
            "Welcome back to the channel and in this video I will show you around the house today.|"
            + "This first part is just filler talk that goes on and on for a while before the point.|" * 3
            + "Most people never check their gutters before winter.|"
            + "Clogged gutters push water against the foundation and that water finds every crack.|"
            + "Take ten minutes and scoop out the leaves then run a hose to see where water goes.|"
            + "That one small fix has saved homeowners thousands of dollars in repairs.|"
            + "As I said this part is about something else and it keeps going without a real point.|" * 3
            + "Grab the free checklist with the first link in the description below right now.|" * 2
            + "Thanks for watching and please subscribe to the channel for more videos like this.|" * 2
        )
        return sentences_from_words(words_from(text.strip("|")))

    def test_best_clip_is_the_hook(self):
        ss = self._sentences()
        cands = moments.candidates(ss, self.TITLE, 20, 55)
        best = max(cands, key=lambda c: c.score)
        self.assertTrue(best.sentences[0].text.startswith("Most people never check"), best.sentences[0].text)
        reasons = " ".join(r for _, r in best.reasons)
        self.assertIn("hook words", reasons)
        self.assertIn("title keywords", reasons)

    def test_penalties(self):
        ss = self._sentences()
        cands = moments.candidates(ss, self.TITLE, 20, 55)
        intro = [c for c in cands if c.start < 1]
        self.assertTrue(all(any("first 20 seconds" in r for _, r in c.reasons) for c in intro))
        plug = [c for c in cands if "first link" in c.text]
        self.assertTrue(plug and all(any("plug" in r for _, r in c.reasons) for c in plug))
        mid = [c for c in cands if c.sentences[0].text.startswith("As I said")]
        self.assertTrue(mid and all(any("mid-thought" in r for _, r in c.reasons) for c in mid))

    def test_pick_no_overlap_and_lengths(self):
        ss = self._sentences()
        cands = moments.candidates(ss, self.TITLE, 20, 55)
        picked = moments.pick(cands, 10)
        self.assertGreaterEqual(len(picked), 1)
        for a in picked:
            self.assertTrue(20 <= a.duration <= 55)
            for b in picked:
                if a is not b:
                    self.assertFalse(a.start < b.end - 0.3 and b.start < a.end - 0.3)
        self.assertEqual(picked, sorted(picked, key=lambda c: c.start))

    def test_chapters(self):
        chs = moments.parse_chapters("0:00 Intro\n1:05 - Gutters\n1:02:03 The End\nnot a chapter", 4000)
        self.assertEqual([(c.start, c.title) for c in chs], [(0, "Intro"), (65, "Gutters"), (3723, "The End")])
        self.assertEqual(chs[0].end, 65)
        self.assertEqual(chs[-1].end, 4000)

    def test_hook_text(self):
        ss = sentences_from_words(words_from("So here's the biggest mistake people make with their attic insulation."))
        clip = moments.Clip(0, 10, ss)
        hook = moments.hook_text(clip)
        self.assertLessEqual(len(hook.split()), 6)
        self.assertEqual(hook, "Here's the Biggest Mistake People Make")
        q = moments.Clip(0, 5, sentences_from_words(words_from("Why do alarms fail?")))
        self.assertEqual(moments.hook_text(q), "Why Do Alarms Fail?")


class TestMetadata(unittest.TestCase):
    def test_title_rules(self):
        ss = sentences_from_words(words_from("Here's the mistake I see on almost every single inspection!!!|More words here."))
        clip = moments.Clip(0, 30, ss)
        t = metadata.make_title(clip, moments.hook_text(clip), "9 Things to Check Before Winter")
        self.assertLessEqual(len(t), 100)
        self.assertFalse(t.endswith("!"))
        self.assertTrue(any(k in t.lower() for k in ("check", "winter")), t)

    def test_title_long(self):
        long = " ".join(["word"] * 60) + "."
        clip = moments.Clip(0, 30, sentences_from_words(words_from(long)))
        t = metadata.make_title(clip, "Word Word", "A " + "Very Long Restaurant Title " * 10)
        self.assertLessEqual(len(t), 100)

    def test_description(self):
        for ch in CHANNELS.values():
            clip = moments.Clip(0, 30, sentences_from_words(words_from("Never order the fish on a Monday.")))
            d = metadata.make_description(clip, "Long Title", ch)
            self.assertIn(ch.link_line, d)
            self.assertIn("#shorts", d)
            self.assertEqual(d.splitlines()[-1].count("#"), 3)
        self.assertIn("payhip.com/b/hiIm1", get_channel("walter").link_line)
        self.assertIn("payhip.com/b/dnY7F", get_channel("Sal").link_line)

    def test_unique_titles(self):
        clip = moments.Clip(0, 30, sentences_from_words(words_from("Same.")))
        plans = [metadata.ShortPlan(i, clip, "h", "Same Title", "d") for i in (1, 2)]
        metadata.unique_titles(plans)
        self.assertEqual([p.title for p in plans], ["Same Title", "Same Title (Part 2)"])


class TestCaptions(unittest.TestCase):
    def test_groups_are_1_to_3_words(self):
        ws = words_from("one two three four five, six. seven eight extraordinarily nine")
        groups = captions.group_words(ws)
        self.assertTrue(all(1 <= len(g) <= 3 for g in groups))
        self.assertEqual(sum(len(g) for g in groups), len(ws))

    def test_ass_has_highlight_and_hook(self):
        ch = get_channel("walter")
        ass = captions.short_ass(words_from("Most people never check this."), "Most People Never Check This", ch, 10)
        self.assertIn("PlayResX: 1080", ass)
        self.assertIn(ass_color(ch.accent), ass)  # highlighted word
        self.assertIn(",Hook,,", ass)
        self.assertIn("0:00:02.50", ass)  # hook bar ends at 2.5 s
        self.assertEqual(ass.count(",Cap,,"), 5)  # one event per word
        no_caps = captions.short_ass(words_from("Most people."), "Hook", ch, 10, captions=False)
        self.assertNotIn(",Cap,,", no_caps)

    def test_ass_color(self):
        self.assertEqual(ass_color("#E07A1F"), "&H001F7AE0")


class TestFaceSmoothing(unittest.TestCase):
    def test_static_face_holds_still(self):
        keys = face.smooth([(t, 960 + (5 if t % 2 else -5)) for t in range(20)], 1920)
        self.assertEqual(len(keys), 1)
        self.assertAlmostEqual(keys[0][1], 960, delta=6)

    def test_moving_face_and_misses(self):
        samples = [(float(t), 600 + 30 * t if t % 4 else None) for t in range(20)]
        samples[7] = (7.0, 1800.0)  # one false detection
        keys = face.smooth(samples, 1920)
        self.assertGreater(len(keys), 2)
        self.assertTrue(all(k[1] < 1300 for k in keys))

    def test_no_face(self):
        self.assertIsNone(face.smooth([(float(t), None) for t in range(10)], 1920))

    def test_crop_expression(self):
        plan = CropPlan(608, 1080, 0, [(0.0, 100.0), (2.0, 200.0), (4.0, 200.0)], True)
        self.assertAlmostEqual(plan.x_at(1.0), 150.0)
        self.assertAlmostEqual(plan.x_at(9.0), 200.0)
        self.assertIn("if(lt(t,2.00)", _crop_x_expr(plan.keys))
        self.assertEqual(plan.filter_at(1.0), "crop=w=608:h=1080:x=150.0:y=0")


class TestTranscriptCache(unittest.TestCase):
    def test_cache_is_reused_without_whisper(self):
        with tempfile.TemporaryDirectory() as td:
            video = Path(td) / "v.mp4"
            video.write_bytes(b"not really a video")
            cache = Path(td) / "transcript.json"
            st = video.stat()
            cache.write_text(
                json.dumps(
                    {
                        "version": transcribe.CACHE_VERSION,
                        "model": "small.en",
                        "duration": 3,
                        "source": {"name": "v.mp4", "size": st.st_size, "mtime": int(st.st_mtime)},
                        "words": [{"word": "Hi.", "start": 0.1, "end": 0.4}],
                    }
                )
            )
            words, dur = transcribe.transcribe(video, cache, "small.en")
            self.assertEqual([w.text for w in words], ["Hi."])
            self.assertEqual(dur, 3)

    def test_whisper_output_is_converted_and_cached(self):
        from types import SimpleNamespace as NS
        from unittest import mock

        seg = NS(end=1.0, words=[NS(word=" Hello", start=0.0, end=0.4), NS(word=" world.", start=0.5, end=1.0)])
        fake = mock.Mock()
        fake.transcribe.return_value = (iter([seg]), NS(duration=1.0, language="en"))
        with tempfile.TemporaryDirectory() as td, mock.patch.object(transcribe, "_load_model", return_value=fake):
            video = Path(td) / "v.mp4"
            video.write_bytes(b"x")
            cache = Path(td) / "transcript.json"
            words, dur = transcribe.transcribe(video, cache, "small.en", "de")
            self.assertEqual([w.text for w in words], ["Hello", "world."])
            self.assertEqual(fake.transcribe.call_args.kwargs["language"], "en")  # .en models are English-only
            self.assertTrue(fake.transcribe.call_args.kwargs["word_timestamps"])
            words2, _ = transcribe.transcribe(video, cache, "small.en")  # second run: from the cache
            self.assertEqual(fake.transcribe.call_count, 1)
            self.assertEqual([w.text for w in words2], ["Hello", "world."])

    def test_fixture_with_segments(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "f.json"
            seg = {"words": [{"text": " b", "start": 1, "end": 2}, {"word": "a", "start": 0, "end": 1}]}
            p.write_text(json.dumps({"segments": [seg]}))
            words, _ = transcribe.load_transcript_file(p)
            self.assertEqual([w.text for w in words], ["a", "b"])


if __name__ == "__main__":
    unittest.main()
