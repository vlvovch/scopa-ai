"""Napoletane 5, 6 and 7 of clubs against the real cards (GitHub issue #2).
The real cards are point symmetric (the bottom row is the top row turned 180
degrees about the card centre) and mix two batons within a row, some of them
mirrored: one with a green cut end up and a red bulb, one with a green bulb up
and a red cut end down. The sprite's 6 matches. Its 5 has the four outer
batons straight instead of leaning with their cut-end tips hooking outward,
and the right column standing the wrong way up. Its 7 has the middle column
the wrong way up, the right column hooking outward instead of inward and the
horizontal baton upside down. Checked baton by baton against the photos with
two measurable features, the side the cut-end tip points to and the side the
leaf sits on (local scratch script features.py of the 2026-11-08 session);
SPEC says, per card and baton, which of the sprite's two drawings to place,
whether to mirror it and whether to turn it upright (see the note at SPEC).
Sources: sources/clubs-N.svg, the card's group extracted unchanged from the
sprite (whose suit ids are swapped: its "N_spade" group is the N of clubs);
outputs: public/cards/napoletane/clubs-N.webp. Each baton is 15 consecutive
<path> elements, found by bounding box in headless Chromium; the drawings used
are copied into <defs> and placed with <use> elements (the bottom row with an
extra 180-degree turn about the centre), the original paths are dropped, and
the top pair of the 5 is rotated so the cut ends point towards the centre line
(the bulbs spread outward, a Λ) and enlarged a little. The WebP files are
rendered the way the originals were made: the 70 x 115 CSS px card at 3x.
Needs Pillow and Playwright with Chromium (python -m playwright install chromium).
Usage: fix-clubs.py [5] [6] [7] [--preview DIR]
  --preview writes the modified SVGs and 6x PNG renders to DIR instead of the WebP files
"""
import pathlib, re, sys, tempfile
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'sources'
OUT = HERE.parents[1] / 'public' / 'cards' / 'napoletane'
ARGS = sys.argv[1:]
CARDS = [int(a) for a in ARGS if a in ('5', '6', '7')] or [5, 7]   # the 6 matches the real card as the sprite drew it; `6` rebuilds it anyway
PREVIEW = pathlib.Path(ARGS[ARGS.index('--preview') + 1]) if '--preview' in ARGS else None
# Per card, the top row left to right as (drawing, mirrored, turned) plus whether the horizontal baton is flipped
# top-to-bottom. The drawings are the sprite's own: 'A' = its top-left baton (green cut end up, red bulb; its cut-end
# tip and its yellow leaf are on the SAME side), 'B' = its second top baton (green bulb up, red cut end down; tip and
# leaf on OPPOSITE sides, like every cut-end-up baton of the real 5 and 7). Turning B upright puts its red end on
# top, so a turned baton also gets its red and green layers swapped (the real cards colour whatever is up green).
# Read off photos of the real cards baton by baton with two measurable features (the side of the hilt-end tip and
# the side of the leaf relative to the baton's axis); the bottom row is always the top row turned 180 degrees.
SPEC = {
    5: dict(top=[('B', False, True), ('B', True, True)], flip_h=False),    # tips hook outward, leaves face inward
    6: dict(top=[('A', False, False), ('B', False, False), ('B', False, False)], flip_h=False),   # the sprite's 6 as drawn
    7: dict(top=[('B', True, True), ('B', True, True), ('B', True, False)], flip_h=True),   # left and middle: tips hook right, leaves left
}
LEAN_DEG, LEAN_SCALE, LEAN_SHIFT = 14, 1.12, 20   # the 5 only: the outer batons' handles lean towards the centre line, the bulbs spread
                                                 # outward, and the pair sits 20 units closer to the centre line than in the sprite

PATH_RE = re.compile(r'<path\b[^>]*?/>', re.S)


def source(n):
    return (SRC / f'clubs-{n}.svg').read_text()


def pips(browser, svg_path):
    """[(cx, cy, w, h, first_idx, last_idx)] per baton, in the main group's coordinates and document order."""
    pg = browser.new_page(viewport={'width': 420, 'height': 676})
    pg.goto(svg_path.as_uri(), wait_until='load')
    boxes = pg.evaluate("() => [...document.querySelectorAll('svg > g > path')].map(p => { const b = p.getBBox(); return [b.x, b.y, b.width, b.height]; })")
    pg.close()
    groups = []
    for i, (x, y, w, h) in enumerate(boxes):
        cx, cy = x + w / 2, y + h / 2
        for g in groups:
            if abs(g['cx'] - cx) < 60 and abs(g['cy'] - cy) < 120 and i == g['last'] + 1:
                g['x1'], g['y1'] = min(g['x1'], x), min(g['y1'], y)
                g['x2'], g['y2'] = max(g['x2'], x + w), max(g['y2'], y + h)
                g['last'] = i
                break
        else:
            groups.append({'cx': cx, 'cy': cy, 'x1': x, 'y1': y, 'x2': x + w, 'y2': y + h, 'first': i, 'last': i})
    out = []
    for g in groups:
        assert g['last'] - g['first'] == 14, g
        out.append(((g['x1'] + g['x2']) / 2, (g['y1'] + g['y2']) / 2, g['x2'] - g['x1'], g['y2'] - g['y1'], g['first'], g['last']))
    return out


def swap_red_green(block):
    """A copy of a drawing with its red fills and its green fills exchanged, shade by shade (both come in four)."""
    fills = sorted(set(re.findall(r'fill:(#[0-9a-fA-F]{6})', block)))
    rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    reds = sorted([f for f in fills if (lambda r, g, b: r > g + 60 and r > b + 60 and g < 100)(*rgb(f))], key=lambda f: sum(rgb(f)))   # g < 100 keeps the yellows out
    greens = sorted([f for f in fills if (lambda r, g, b: g > r + 20 and g > b)(*rgb(f))], key=lambda f: sum(rgb(f)))
    assert len(reds) == len(greens) == 4, (reds, greens)
    table = {**dict(zip(reds, greens)), **dict(zip(greens, reds))}
    return re.sub(r'fill:(#[0-9a-fA-F]{6})', lambda m: 'fill:' + table.get(m.group(1), m.group(1)), block)


def rebuild(text, pip_list, n):
    spans = [m.span() for m in PATH_RE.finditer(text)]
    assert len(spans) == 15 * len(pip_list), (len(spans), len(pip_list))
    wide = [p for p in pip_list if p[2] > p[3]]
    cx = wide[0][0] if wide else sum(p[0] for p in pip_list) / len(pip_list)
    cy = wide[0][1] if wide else sum(p[1] for p in pip_list) / len(pip_list)
    top = sorted([p for p in pip_list if p[1] < cy - 50], key=lambda p: p[0])
    spec = SPEC[n]
    assert len(spec['top']) == len(top), (spec, len(top))
    protos = {'A': top[0], 'B': top[1]}           # the sprite's drawings, kept inside <defs> and placed with <use>
    if wide:
        protos['H'] = wide[0]
    blocks = {k: text[spans[p[4]][0]:spans[p[5]][1]] for k, p in protos.items()}
    variants = {}                                 # id -> drawing text; a turned baton uses the recoloured copy
    for drawing, _, turned in spec['top']:
        vid = drawing + ('s' if turned else '')
        variants[vid] = swap_red_green(blocks[drawing]) if turned else blocks[drawing]
    if wide:
        variants['H'] = blocks['H']
    defs = '\n<defs>' + ''.join(f'\n<g id="clubs{n}-{vid}">\n{body}\n</g>' for vid, body in variants.items()) + '\n</defs>'
    uses = ''
    py = top[0][1]
    for c, (drawing, mirrored, turned) in enumerate(spec['top']):
        px, sx = top[c][0], protos[drawing][0]
        vid = drawing + ('s' if turned else '')
        parts = []
        if n == 5:                                # the real card: the top pair forms a Λ, cut ends towards the centre line
            angle = LEAN_DEG if px < cx else -LEAN_DEG    # SVG rotate() is clockwise on screen: the left baton's top moves right
            shift = LEAN_SHIFT if px < cx else -LEAN_SHIFT
            parts += [f'translate({px + shift:.2f} {py:.2f})', f'rotate({angle})', f'scale({LEAN_SCALE})']
        else:
            parts += [f'translate({px:.2f} {py:.2f})']
        if mirrored:
            parts += ['scale(-1 1)']
        if turned:
            parts += ['rotate(180)']              # about the baton's own centre, which the last translate puts at the origin
        parts += [f'translate({-sx:.2f} {-py:.2f})']
        tf = ' '.join(parts)
        uses += f'\n<use xlink:href="#clubs{n}-{vid}" transform="{tf}"/>'
        uses += f'\n<use xlink:href="#clubs{n}-{vid}" transform="rotate(180 {cx:.2f} {cy:.2f}) {tf}"/>'
    if wide:
        tf = f' transform="translate({cx:.2f} {cy:.2f}) scale(1 -1) translate({-cx:.2f} {-cy:.2f})"' if spec['flip_h'] else ''
        uses += f'\n<use xlink:href="#clubs{n}-H"{tf}/>'
    first, last = spans[0][0], spans[-1][1]       # every path of the group is a pip: drop them all
    close = text.rfind('</g>')                    # the main group's closing tag
    text = text[:first] + text[last:close] + defs + uses + '\n' + text[close:]
    if 'xmlns:xlink' not in text:                 # the individual files declare no xlink namespace
        text = text.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ', 1)
    return text


def render(browser, svg_path, png_path, scale):
    pg = browser.new_page(viewport={'width': 70, 'height': 115}, device_scale_factor=scale)
    pg.goto(svg_path.as_uri(), wait_until='load'); pg.wait_for_timeout(150)
    pg.screenshot(path=str(png_path), omit_background=True); pg.close()


def main():
    with sync_playwright() as pw, tempfile.TemporaryDirectory() as tmp:
        browser = pw.chromium.launch(headless=True)
        for n in CARDS:
            text = source(n)
            pip_list = pips(browser, SRC / f'clubs-{n}.svg')
            new = rebuild(text, pip_list, n)
            if PREVIEW:
                PREVIEW.mkdir(parents=True, exist_ok=True)
                svg = PREVIEW / f'clubs-{n}.svg'; svg.write_text(new)
                render(browser, svg, PREVIEW / f'clubs-{n}.png', 6)
                print('preview', n, PREVIEW / f'clubs-{n}.png')
            else:
                svg = pathlib.Path(tmp) / f'clubs-{n}.svg'; svg.write_text(new)
                png = pathlib.Path(tmp) / f'clubs-{n}.png'
                render(browser, svg, png, 3)      # the WebP files are the 70 x 115 CSS px card at 3x = 210 x 345
                im = Image.open(png).convert('RGBA'); assert im.size == (210, 345), im.size
                im.save(OUT / f'clubs-{n}.webp', quality=90, method=6)
                print('wrote', OUT / f'clubs-{n}.webp', (OUT / f'clubs-{n}.webp').stat().st_size, 'bytes')
        browser.close()


if __name__ == '__main__':
    main()
