#!/usr/bin/env bash
# Shorts Factory — turn one long video into YouTube Shorts.
#   ./shorts_factory/make_shorts.sh "/path/to/Video.mp4" --channel walter
# Run ./shorts_factory/make_shorts.sh --help for all options.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${SHORTS_FACTORY_VENV:-$HOME/.shorts-factory-venv}"

if [ -x "$VENV/bin/python" ]; then
  PY="$VENV/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
else
  echo "Python 3 is missing. Run the installer first:  $HERE/install_mac.sh" >&2
  exit 1
fi

# Homebrew's ffmpeg lives here on Apple Silicon Macs (not always on PATH from Finder).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PYTHONPATH="$HERE${PYTHONPATH:+:$PYTHONPATH}"
exec "$PY" -m shortsfactory "$@"
