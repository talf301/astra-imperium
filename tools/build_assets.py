"""Build the web images from the Astra Imperium print-and-play PDF.

Usage:
  uv run --no-project --with pillow python -I tools/build_assets.py \
      "<.../Letter/Letter-NoBleed-AstraImperium.pdf>" public/img [contact-sheet-dir]

The PDF pages are rendered at 300 dpi with pdftoppm (poppler) and cut on the print grid:
cards are 2.5 x 3.5 in on a 3 x 3 grid whose corner is 0.5 in, 0.25 in from the page corner.
"""

import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

PDF, OUT = sys.argv[1], sys.argv[2]
SHEETS = sys.argv[3] if len(sys.argv) > 3 else None
DPI = 300
CW, CH, OX, OY = 750, 1050, 150, 75

tmp = tempfile.mkdtemp(prefix="astra-pages-")
_pages = {}


def page(n):
    if n not in _pages:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-f", str(n), "-l", str(n), "-png", PDF, f"{tmp}/p"], check=True)
        _pages[n] = Image.open(f"{tmp}/p-{n:02d}.png").convert("RGB")
    return _pages[n]


def cell(p, r, c):
    return page(p).crop((OX + c * CW, OY + r * CH, OX + (c + 1) * CW, OY + (r + 1) * CH))


made = {}


def save(im, name, w, q=84):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if im.size[0] != w:
        im = im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS)
    im.save(path, "WEBP", quality=q, method=6)
    made[name] = im


# Action cards: id -> (page, row, col). Ids match public/engine/data.mjs.
CARDS = {
    "lab": (9, 0, 2), "tribute_s": (9, 1, 0), "harvester": (9, 1, 1), "mining": (9, 1, 2),
    "holo": (9, 2, 0), "conquest_a": (9, 2, 1), "qb_a": (9, 2, 2),
    "mars_a": (11, 0, 0), "nova_a": (11, 0, 1), "urbis_a": (11, 0, 2),
    "vault_a": (11, 1, 0), "flux_a": (11, 1, 1), "training": (11, 1, 2),
    "flux_b": (11, 2, 0), "mars_b": (11, 2, 1), "qb_b": (11, 2, 2),
    "urbis_b": (13, 0, 0), "vault_b": (13, 0, 1), "nova_b": (13, 0, 2),
    "tribute_i": (13, 1, 0), "conquest_b": (13, 1, 1),
    "edict": (17, 2, 1),
}
for cid, (p, r, c) in CARDS.items():
    save(cell(p, r, c), f"c/{cid}.webp", 660)
save(cell(10, 0, 0), "c/back.webp", 400)

# Scenario cards: fronts on pages 1 and 3, backs mirrored on pages 2 and 4.
SCEN = {
    "1.1e": (1, 0, 1), "1.2e": (1, 0, 2), "1.2d": (1, 1, 0), "1.3e": (1, 1, 1), "1.3d": (1, 1, 2),
    "1.3t": (1, 2, 0), "1.4e": (1, 2, 1), "1.4d": (1, 2, 2), "1.4t": (3, 0, 0),
    "2.1": (3, 0, 2), "2.2l": (3, 1, 0), "2.2i": (3, 1, 1), "2.3pl": (3, 1, 2),
    "2.3po": (3, 2, 0), "2.4d": (3, 2, 1), "2.4c": (3, 2, 2),
}
for sid, (p, r, c) in SCEN.items():
    save(cell(p, r, c), f"s/{sid}.webp", 600)
    save(cell(p + 1, r, 2 - c), f"s/{sid}-back.webp", 600)
save(cell(1, 0, 0), "s/c1.webp", 400)
save(cell(3, 0, 1), "s/c2.webp", 400)

# Leaders.
LEAD = {"calculigula": (19, 0, 2), "commodorus": (19, 1, 0), "starjan": (19, 1, 1),
        "kallax": (20, 0, 0), "voidspasian": (20, 1, 1), "cyberius": (20, 1, 2)}
for lid, (p, r, c) in LEAD.items():
    save(cell(p, r, c), f"l/{lid}.webp", 600)

# Map mats, turned so their labels read left to right.
MAPBOX = {"L": (163, 230, 1273, 1955), "R": (1275, 230, 2385, 1955)}
save(page(25).crop(MAPBOX["L"]).rotate(-90, expand=True), "map/galaxia.webp", 1100)
save(page(25).crop(MAPBOX["R"]).rotate(-90, expand=True), "map/earth.webp", 1100)
save(page(27).crop(MAPBOX["R"]).rotate(-90, expand=True), "map/constantius.webp", 1100)

# Monument tiles: 4 x 5 grid on page 33. Index 0 is the basic tile, 1 and 2 the variants.
TILES = [
    ["vault_1", "mars_1", "flux_2", "urbis_1"],
    ["qb_2", "vault_2", "mars_2", "flux_1"],
    ["urbis_2", None, "nova_2", "nova_1"],
    [None, "qb_0", "vault_0", "urbis_0"],
    ["nova_0", "flux_0", "mars_0", "qb_1"],
]
TX, TY, TW, TH = 354, 684, 461, 462
for r, row in enumerate(TILES):
    for c, name in enumerate(row):
        if name:
            x, y = TX + c * TW, TY + r * TH
            save(page(33).crop((x + 4, y + 4, x + TW - 4, y + TH - 4)), f"t/{name}.webp", 360, q=86)

# Player boards (page 35, turned upright): the invader column.
board = page(35).rotate(-90, expand=True)
save(board.crop((1545, 150, 2250, 2400)), "invader.webp", 500)
save(board.crop((1545, 150, 2250, 890)), "act1.webp", 500)
save(board.crop((1545, 890, 2250, 1610)), "act2.webp", 500)
save(board.crop((1545, 1610, 2250, 2400)), "act3.webp", 500)

# App icons from the card back.
back = cell(10, 0, 0)
sq = back.crop((40, 190, 710, 860))
for n in (180, 192, 512):
    sq.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, "..", f"icon-{n}.png"))

total = 0
for d, _, names in os.walk(OUT):
    total += sum(os.path.getsize(os.path.join(d, n)) for n in names)
print(len(made), "images,", round(total / 1e6, 1), "MB")

if SHEETS:
    os.makedirs(SHEETS, exist_ok=True)

    def sheet(prefix, cols, w, fname):
        items = sorted((k, v) for k, v in made.items() if k.startswith(prefix))
        if not items:
            return
        h = round(items[0][1].size[1] * w / items[0][1].size[0])
        rows = -(-len(items) // cols)
        sh = Image.new("RGB", (cols * w, rows * (h + 14)), "white")
        d = ImageDraw.Draw(sh)
        for i, (k, im) in enumerate(items):
            x, y = (i % cols) * w, (i // cols) * (h + 14)
            sh.paste(im.resize((w, h), Image.LANCZOS), (x, y + 14))
            d.text((x + 3, y + 1), k, fill="black")
        sh.save(os.path.join(SHEETS, fname))

    sheet("c/", 6, 330, "cards.png")
    sheet("s/", 6, 330, "scenarios.png")
    sheet("l/", 6, 330, "leaders.png")
    sheet("t/", 6, 300, "tiles.png")
    sheet("map/", 2, 800, "maps.png")
    sheet("act", 3, 400, "acts.png")
