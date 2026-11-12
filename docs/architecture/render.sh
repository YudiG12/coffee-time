#!/usr/bin/env bash
# Regenerates every diagram (LLD v1, flow maps, banner, HLD) and renders them to PNG at 2x.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --virtual-time-budget=4000 --window-size="$2,$3" --screenshot="$PWD/$4" "file://$PWD/$1" 2>/dev/null; }
size() { python3 -c "import re,sys;m=re.search(r'viewBox=\"0 0 (\d+) (\d+)',open(sys.argv[1]).read());print(m[1],m[2])" "$1"; }
python3 architecture/draw_flows.py >/dev/null
for f in architecture/v*.svg architecture/flows/*.svg; do read w h < <(size "$f"); shot "$f" "$w" "$h" "${f%.svg}.png"; done
if [ -f assets/build.py ]; then
  python3 assets/build.py
  shot assets/banner.html 1280 364 assets/banner.png
  shot assets/hld.html 1200 500 assets/hld-light.png
fi
echo "rendered; now open every PNG and check it"
