"""Napoletane 3, 5 and 7 of swords against the real cards (GitHub issue #2, follow-up).
The sprite's 3 is the real card turned 180 degrees: on the real card the outer hilts
are at the top, the middle hilt at the bottom and the ribbon a V with its vertex at
the bottom. On the sprite's 5 and 7 the horizontal middle sword has its hilt on the
left; on the real cards it is on the right. Checked sword by sword against the photos
with a measurable feature, the side of the hilt (yellow) relative to the blade (blue)
along the sword's axis, which agrees with the photos on the 2, 4 and 6 (local scratch
script features.py of the 2026-11-08 session). Mirroring and turning the middle sword
give the same silhouette and differ in the grip's hatching direction; measured by the
dominant diagonal of the dark pixels on the hilt (hatch.py), the real cards hatch the
same way on both, the sprite's two drawings opposite ways, so the 5's sword is turned
and the 7's mirrored (MIDDLE). Sources: sources/swords-N.svg,
the card's group extracted unchanged from the sprite (whose suit ids are swapped:
its "N_club" group is the N of swords); outputs: public/cards/napoletane/swords-N.webp.
The 3 is drawn as 15 colour layers of the whole design, so the whole main group is
turned about the artwork centre (which is the viewBox centre); on the 5 and 7 the
middle sword is three consecutive <path> elements (bounding box wider than tall,
found in headless Chromium), wrapped in a group that mirrors (or turns) them about
their own centre. The WebP files are rendered the way the originals were made: the
70 x 115 CSS px card at 3x.
Needs Pillow and Playwright with Chromium (python -m playwright install chromium).
Usage: fix-swords.py [3] [5] [7] [--preview DIR]
  --preview writes the modified SVGs and 6x PNG renders to DIR instead of the WebP files
"""
import pathlib, re, sys, tempfile
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'sources'
OUT = HERE.parents[1] / 'public' / 'cards' / 'napoletane'
ARGS = sys.argv[1:]
CARDS = [int(a) for a in ARGS if a in ('3', '5', '7')] or [3, 5, 7]
PREVIEW = pathlib.Path(ARGS[ARGS.index('--preview') + 1]) if '--preview' in ARGS else None
MIDDLE = {5: 'turn', 7: 'mirror'}   # how the middle sword changes hands: both end up hatched like the real cards

PATH_RE = re.compile(r'<path\b[^>]*?/>', re.S)
GROUP_OPEN_RE = re.compile(r'<g\b[^>]*>', re.S)


def source(n):
    return (SRC / f'swords-{n}.svg').read_text()


def boxes(browser, svg_path):
    """The main group's bounding box and those of its direct <path> children, in the group's coordinates, document order."""
    pg = browser.new_page(viewport={'width': 420, 'height': 676})
    pg.goto(svg_path.as_uri(), wait_until='load')
    info = pg.evaluate("""() => { const g = document.querySelector('svg > g'); const box = e => { const b = e.getBBox(); return [b.x, b.y, b.width, b.height]; };
        return {group: box(g), paths: [...g.querySelectorAll(':scope > path')].map(box)}; }""")
    pg.close()
    return info['group'], info['paths']


def rebuild(text, group, paths, n):
    gx, gy, gw, gh = group
    cx, cy = gx + gw / 2, gy + gh / 2
    spans = [m.span() for m in PATH_RE.finditer(text)]
    assert len(spans) == len(paths), (len(spans), len(paths))
    if n == 3:                                    # every path is a colour layer of the whole design: turn all of it
        open_end = GROUP_OPEN_RE.search(text).end()
        close = text.rfind('</g>')
        return text[:open_end] + f'\n<g transform="rotate(180 {cx:.2f} {cy:.2f})">' + text[open_end:close] + '</g>\n' + text[close:]
    wide = [i for i, (x, y, w, h) in enumerate(paths) if w > 1.5 * h and w > 100]
    assert wide == list(range(wide[0], wide[0] + 3)), wide     # the middle sword: three consecutive paths (yellow, blue, outline)
    x1 = min(paths[i][0] for i in wide); x2 = max(paths[i][0] + paths[i][2] for i in wide)
    y1 = min(paths[i][1] for i in wide); y2 = max(paths[i][1] + paths[i][3] for i in wide)
    hx, hy = (x1 + x2) / 2, (y1 + y2) / 2
    tf = f'translate({hx:.2f} {hy:.2f}) scale(-1 1) translate({-hx:.2f} {-hy:.2f})' if MIDDLE[n] == 'mirror' else f'rotate(180 {hx:.2f} {hy:.2f})'
    a, b = spans[wide[0]][0], spans[wide[-1]][1]
    return text[:a] + f'<g transform="{tf}">\n' + text[a:b] + '\n</g>' + text[b:]


def render(browser, svg_path, png_path, scale):
    pg = browser.new_page(viewport={'width': 70, 'height': 115}, device_scale_factor=scale)
    pg.goto(svg_path.as_uri(), wait_until='load'); pg.wait_for_timeout(150)
    pg.screenshot(path=str(png_path), omit_background=True); pg.close()


def main():
    with sync_playwright() as pw, tempfile.TemporaryDirectory() as tmp:
        browser = pw.chromium.launch(headless=True)
        for n in CARDS:
            text = source(n)
            group, paths = boxes(browser, SRC / f'swords-{n}.svg')
            new = rebuild(text, group, paths, n)
            if PREVIEW:
                PREVIEW.mkdir(parents=True, exist_ok=True)
                svg = PREVIEW / f'swords-{n}.svg'; svg.write_text(new)
                render(browser, svg, PREVIEW / f'swords-{n}.png', 6)
                print('preview', n, PREVIEW / f'swords-{n}.png')
            else:
                svg = pathlib.Path(tmp) / f'swords-{n}.svg'; svg.write_text(new)
                png = pathlib.Path(tmp) / f'swords-{n}.png'
                render(browser, svg, png, 3)      # the WebP files are the 70 x 115 CSS px card at 3x = 210 x 345
                im = Image.open(png).convert('RGBA'); assert im.size == (210, 345), im.size
                im.save(OUT / f'swords-{n}.webp', quality=90, method=6)
                print('wrote', OUT / f'swords-{n}.webp', (OUT / f'swords-{n}.webp').stat().st_size, 'bytes')
        browser.close()


if __name__ == '__main__':
    main()
