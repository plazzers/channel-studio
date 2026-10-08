#!/usr/bin/env bash
# Shorts Factory — one-time install for the Mac (Apple Silicon or Intel).
#   ./shorts_factory/install_mac.sh
# Installs: ffmpeg (with Homebrew), a private Python environment in
# ~/.shorts-factory-venv, faster-whisper + OpenCV, and the speech model.
# Safe to run again: it skips what is already there.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${SHORTS_FACTORY_VENV:-$HOME/.shorts-factory-venv}"
MODEL="${SHORTS_FACTORY_MODEL:-small.en}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

echo "🎬 Shorts Factory installer"

step "1/4 ffmpeg (cuts and renders the video)"
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg is installed ($(ffmpeg -version 2>/dev/null | awk 'NR==1{print $3}'))"
elif command -v brew >/dev/null 2>&1; then
  echo "  Installing ffmpeg with Homebrew (takes a few minutes)…"
  brew install ffmpeg
  ok "ffmpeg installed"
else
  cat <<'MSG'
  Homebrew is not installed. Homebrew is the free tool that installs ffmpeg.
  1. Open https://brew.sh and copy the one-line command shown there.
  2. Paste it into Terminal, press Enter and follow the instructions
     (it asks for your Mac password; at the end it may print two
     "Next steps" commands — run those too).
  3. Run this installer again.
MSG
  exit 1
fi
FILTERS="$(ffmpeg -hide_banner -filters 2>/dev/null || true)"
if ! grep -qE '^ ... ass ' <<<"$FILTERS"; then
  cat <<'MSG'
  Your ffmpeg can't draw captions (it was built without "libass").
  Fix it with these three commands, then run this installer again:
    brew uninstall ffmpeg
    brew tap homebrew-ffmpeg/ffmpeg
    brew install homebrew-ffmpeg/ffmpeg/ffmpeg
MSG
  exit 1
fi
ok "ffmpeg can burn in captions"

step "2/4 Python"
PY=""
for p in python3.12 python3.11 python3.13 python3.10 python3; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
    PY="$(command -v "$p")"; break
  fi
done
if [ -z "$PY" ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "  Installing Python with Homebrew…"
    brew install python@3.12
    PY="$(brew --prefix)/bin/python3.12"
  else
    fail "Python 3.10 or newer is needed. Install Homebrew (https://brew.sh), then run this again."
  fi
fi
ok "Using $("$PY" --version) at $PY"

step "3/4 Private Python environment in $VENV"
if [ ! -x "$VENV/bin/python" ]; then
  "$PY" -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --quiet --upgrade pip
echo "  Installing faster-whisper and OpenCV (1–3 minutes)…"
"$VENV/bin/python" -m pip install --quiet -r "$HERE/requirements.txt"
ok "Python packages installed"

step "4/4 Speech model '$MODEL' (about 500 MB, one time)"
if [ "${SHORTS_FACTORY_SKIP_MODEL:-0}" = "1" ]; then
  ok "Skipped (SHORTS_FACTORY_SKIP_MODEL=1). It downloads on the first run instead."
else
  "$VENV/bin/python" - "$MODEL" <<'PYCODE'
import sys
from faster_whisper import WhisperModel
WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
PYCODE
  ok "Model downloaded — everything now works offline"
fi

chmod +x "$HERE/make_shorts.sh" "$HERE/Make Shorts.command" 2>/dev/null || true
echo
echo "✅ All set! Double-click \"Make Shorts.command\" in the shorts_factory folder,"
echo "   or run:  $HERE/make_shorts.sh \"/path/to/Video.mp4\" --channel walter"
