#!/bin/sh
# Usage: tools/montage.sh out.png height 'name=query' 'name=query' ...   (screenshots side by side, for review)
out=$1; h=$2; shift 2
dir=$(mktemp -d)
i=0
for item in "$@"; do
  i=$((i+1)); name=${item%%=*}; q=${item#*=}
  "$(dirname "$0")/shot.sh" "$dir/$(printf %02d $i)-$name.png" "h=$h&$q"
done
uv run --no-project --with pillow python -I - "$dir" "$out" "$h" <<'PY'
import sys, glob
from PIL import Image, ImageDraw
d, out, h = sys.argv[1], sys.argv[2], int(sys.argv[3])
fs = sorted(glob.glob(d + "/*.png"))
s = 0.5
w, hh = int(780 * s), int(h * 2 * s)
cols = min(4, len(fs)); rows = -(-len(fs) // cols)
sh = Image.new("RGB", (cols * (w + 6), rows * (hh + 16)), "white")
dr = ImageDraw.Draw(sh)
for i, f in enumerate(fs):
    im = Image.open(f).crop((0, 0, 780, h * 2)).resize((w, hh), Image.LANCZOS)
    x, y = (i % cols) * (w + 6), (i // cols) * (hh + 16)
    sh.paste(im, (x, y + 14)); dr.text((x + 2, y + 1), f.split("/")[-1], fill="black")
sh.save(out)
PY
