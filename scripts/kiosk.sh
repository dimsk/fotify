#!/usr/bin/env bash
# Launches the fotify slideshow in a Chromium/Chrome kiosk window: no address
# bar, no tabs, no window chrome at all, from the very first frame — meant
# for a dedicated display (TV + Raspberry Pi/mini-PC) that just shows the
# slideshow forever. See scripts/fotify-kiosk.service for autostart-on-boot.
set -euo pipefail

URL="${1:-http://omv:15766}"

# Prevent the screen from blanking/sleeping while the slideshow runs (X11 only).
if command -v xset >/dev/null 2>&1; then
  xset s off
  xset s noblank
  xset -dpms
fi

# Hide the mouse cursor when idle, if available.
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

BROWSER=""
for candidate in chromium-browser chromium google-chrome google-chrome-stable; do
  if command -v "$candidate" >/dev/null 2>&1; then
    BROWSER="$candidate"
    break
  fi
done

if [ -z "$BROWSER" ]; then
  echo "No Chromium/Chrome browser found in PATH." >&2
  exit 1
fi

exec "$BROWSER" \
  --kiosk \
  --app="$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --incognito
