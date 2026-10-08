# SPEC — Shorts Factory (local tool for Luka's Mac)

Goal: turn one long YouTube video (an AI-avatar talking-head video, 16:9, 8–20 min) into 5–8 ready-to-post YouTube Shorts in minutes, with almost no manual work. It must run on Luka's MacBook Air (Apple Silicon, macOS) with ONE command, after a one-time install. It also runs on Linux (for tests here).

Put everything in `shorts_factory/` in this repo. Do not touch the Channel Studio web app except adding a link to the README.

## 1. Usage
```
./shorts_factory/make_shorts.sh "/path/to/Video.mp4" --channel walter   # or sal
```
Options: `--count 6` (default 6, max 10), `--chapters chapters.txt` (YouTube chapter list, optional), `--mode crop|blur` (default `crop`), `--min 20 --max 55` (seconds), `--lang en`, `--out <folder>` (default: a folder next to the video named `<video name> - SHORTS`).
Also provide `shorts_factory/Make Shorts.command` (double-clickable on Mac: asks for the video via a file dialog with `osascript`, asks Walter/Sal, then runs).

## 2. Pipeline
1. **Transcribe** with `faster-whisper` (model `small.en` default, `--model` option; CPU int8; word timestamps). Cache the transcript JSON next to the output so re-runs are instant.
2. **Pick moments**: build candidate clips 20–55 s that start and end on sentence boundaries. Score each with transparent heuristics (print the reasons in `report.md`): strong first sentence (numbers, "never", "most people", "mistake", "check", "don't", questions, "here's"), self-contained (no "as I said", "next", "in this video" at the start; ends on a complete thought), words-per-second energy, keyword overlap with the video title, penalty for intro/outro/sponsor/product-plug sections and for the first 20 s. If chapters are given, prefer one clip per chapter. Pick the top N non-overlapping clips.
3. **Render** each clip 1080x1920, H.264 + AAC, ≤ 60 s, loudness-normalized (`loudnorm`):
   - `crop` mode: center crop to 9:16 following the face. Use a simple face-center estimate (OpenCV Haar cascade on sampled frames, smoothed); fall back to center.
   - `blur` mode: full 16:9 frame scaled to width 1080 in the middle, blurred zoomed copy as background.
   - **Captions burned in** (ASS via ffmpeg/libass): 1–3 words at a time, word-timed, big bold font (bundle an OFL font: Montserrat ExtraBold or Anton), white with thick outline, the current word highlighted in the channel accent color; placed in the lower-middle safe zone (not under YouTube UI).
   - **Hook bar** for the first 2.5 s at the top: ≤ 6 words derived from the clip's first sentence (title case), channel colors.
   - Channel styles: Walter — navy #1C2B3A / orange #E07A1F / off-white #F2EDE4; Sal — espresso #2A1E18 / tomato #BE3A24 / cream #FAF4E8.
4. **Metadata** per clip in `shorts.csv` and `SHORTS.md`: title (≤ 100 chars, contains a keyword from the long video title, ends with no clickbait), description (2 lines + the channel's link line + `#shorts` + 2 hashtags), source timestamps, duration, score + reasons. Link lines: Walter → `FREE checklist: https://payhip.com/b/hiIm1` ; Sal → `FREE 25 Rules for Eating Out: https://payhip.com/b/dnY7F`. Also a `channel-studio-import.json` matching Channel Studio's Shorts fields (hook, start, end, on-screen text, title, description, status "cut") so Luka can import the plan (add an "Import Shorts JSON" button in Channel Studio's Shorts tab ONLY if it's a small, safe change; otherwise skip).
5. **Thumbnails/covers**: export a 1080x1920 JPG frame per clip with the hook text (for the Shorts cover).

## 3. Install (one time, Mac)
`shorts_factory/install_mac.sh`: checks/installs Homebrew ffmpeg (`brew install ffmpeg` — print instructions if brew missing, don't auto-install brew), creates a Python venv in `~/.shorts-factory-venv`, installs `faster-whisper opencv-python-headless`, downloads the model on first run. README in plain, simple English with screenshots of the terminal output. Everything works offline after install.

## 4. Quality & tests
- `shorts_factory/tests/`: generate a synthetic 3-minute 16:9 test video here (ffmpeg testsrc + a face-like test image + TTS audio via `espeak-ng` or `pyttsx3` if available; otherwise a pre-written transcript fixture that bypasses whisper with `--transcript fixture.json`). Assert: N outputs, each 1080x1920, 20–60 s, audio present, captions burned (compare frames with/without), no overlapping source ranges, CSV/MD/JSON valid, titles ≤ 100 chars.
- Render 2 sample Shorts from the test video and put stills in `docs/screens/shorts-*.png`.
- Lint with ruff; keep dependencies minimal.
- Commit to main (`git pull --rebase` before pushing — another session may be pushing to this repo in a different folder).
