#!/usr/bin/env bash
# Double-click me in Finder. I ask for the video and the channel, then make the Shorts.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
clear
echo "🎬 Shorts Factory"
echo

VIDEO="$(osascript -e 'POSIX path of (choose file with prompt "Choose the long video to turn into Shorts:" of type {"public.movie"})' 2>/dev/null)" || {
  echo "No video chosen. Bye!"; exit 0; }

CHOICE="$(osascript -e 'choose from list {"Walter", "Sal"} with prompt "Which channel is this video for?" default items {"Walter"}' 2>/dev/null)"
if [ -z "$CHOICE" ] || [ "$CHOICE" = "false" ]; then
  echo "No channel chosen. Bye!"; exit 0
fi
CHANNEL="$(echo "$CHOICE" | tr '[:upper:]' '[:lower:]')"

# Optional: a chapters file with the same name as the video (Video.chapters.txt or Video.txt).
EXTRA=()
BASE="${VIDEO%.*}"
for f in "$BASE.chapters.txt" "$BASE.txt"; do
  if [ -f "$f" ]; then EXTRA=(--chapters "$f"); echo "Using chapters from $(basename "$f")"; break; fi
done

echo "Video:   $VIDEO"
echo "Channel: $CHOICE"
echo
if "$HERE/make_shorts.sh" "$VIDEO" --channel "$CHANNEL" "${EXTRA[@]}"; then
  OUT="$(dirname "$VIDEO")/$(basename "$BASE") - SHORTS"
  open "$OUT" 2>/dev/null || true
  echo
  echo "All done — the folder with your Shorts is open. You can close this window."
else
  echo
  echo "❌ Something went wrong (see the message above)."
  echo "   First time? Run install_mac.sh once (see shorts_factory/README.md)."
fi
read -r -p "Press Enter to close…" _ || true
