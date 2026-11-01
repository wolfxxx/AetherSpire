"""Turn generated art (art/gen/*.png) into game assets and embed them in js/assets.js as data URIs.
python tools/buildart.py
- maps: resized to the 1920x1088 world, tone-balanced, WebP
- tower sheets (2x2): background keyed out, split into 4 stages, cropped, WebP
- enemy sheets / bosses: keyed, split, cropped, WebP
Embedding as data URIs keeps the WebGL post-process working even when index.html is opened from disk."""
import os, io, base64, json
import numpy as np
from PIL import Image, ImageEnhance, ImageStat, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN, OUT = os.path.join(ROOT, 'art', 'gen'), os.path.join(ROOT, 'assets')
os.makedirs(OUT, exist_ok=True)
assets, meta = {}, {}


def key(img, bg):
    """Chroma-key a flat magenta/green background to alpha with a soft edge and spill suppression."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    k = np.array(bg, np.float32)
    d = np.sqrt(((a - k) ** 2).sum(-1))
    tol = 110.0
    alpha = np.clip((d - tol) / tol, 0, 1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if bg == (255, 0, 255):   # pull magenta spill off the fringe
        m = np.minimum(r, b); lim = g + (m - g) * alpha
        r = np.where(m > g, np.minimum(r, lim), r); b = np.where(m > g, np.minimum(b, lim), b)
    else:                     # green spill
        lim = np.maximum(r, b) + (g - np.maximum(r, b)) * alpha
        g = np.where(g > np.maximum(r, b), np.minimum(g, lim), g)
    out = np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    # drop tiny islands of leftover background noise
    al = im.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    im.putalpha(Image.fromarray(np.minimum(np.asarray(al), np.asarray(im.getchannel('A')))))
    return im


def isolate(im, gap=10):
    """Keep only the largest vertical run of content, dropping fragments from neighbouring sheet cells."""
    al = np.asarray(im.getchannel('A')).astype(np.float32)
    rows = (al > 24).sum(1)
    runs, start, empty = [], None, 0
    for y, n in enumerate(rows):
        if n > 0:
            if start is None: start = y
            empty = 0
        elif start is not None:
            empty += 1
            if empty >= gap: runs.append((start, y - empty + 1)); start, empty = None, 0
    if start is not None: runs.append((start, len(rows)))
    if len(runs) <= 1: return im
    best = max(runs, key=lambda r: al[r[0]:r[1]].sum())
    a2 = np.asarray(im).copy(); a2[:best[0], :, 3] = 0; a2[best[1]:, :, 3] = 0
    return Image.fromarray(a2, 'RGBA')


def crop(im, pad=6):
    al = np.asarray(im.getchannel('A'))
    ys, xs = np.where(al > 24)
    if not len(xs):
        return im
    return im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad), min(im.height, ys.max() + pad)))


def put(name, im, fmt='WEBP', q=86):
    buf = io.BytesIO()
    im.save(buf, fmt, quality=q, method=6)
    im.save(os.path.join(OUT, name + ('.webp' if fmt == 'WEBP' else '.jpg')), fmt, quality=q)
    assets[name] = 'data:image/' + fmt.lower() + ';base64,' + base64.b64encode(buf.getvalue()).decode()
    meta[name] = [im.width, im.height]


def fit(im, maxdim):
    s = maxdim / max(im.width, im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS) if s < 1 else im


MAG, GRN = (255, 0, 255), (0, 255, 0)
# ---------------------------------------------------------------- maps
for m in ['verdant', 'skyreach', 'neon', 'cinder']:
    p = os.path.join(GEN, f'map_{m}.png')
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert('RGB').resize((1920, 1088), Image.LANCZOS)
    lum = ImageStat.Stat(im.convert('L')).mean[0]
    target = {'verdant': 92, 'skyreach': 100, 'neon': 60, 'cinder': 62}[m]
    im = ImageEnhance.Brightness(im).enhance(max(0.85, min(1.45, target / max(1, lum))))
    im = ImageEnhance.Contrast(im).enhance(1.05)
    put('map_' + m, im, q=84)
    print('map', m, round(lum), '->', round(ImageStat.Stat(im.convert('L')).mean[0]))
# ---------------------------------------------------------------- towers (2x2 sheets)
for t, bg in [('prism', MAG), ('mortar', MAG), ('frost', MAG), ('storm', MAG), ('grove', MAG), ('conduit', GRN), ('void', GRN)]:
    p = os.path.join(GEN, f'tower_{t}.png')
    if not os.path.exists(p):
        continue
    sheet = key(Image.open(p), bg)
    w, h = sheet.width // 2, sheet.height // 2
    for k in range(4):
        cell = sheet.crop(((k % 2) * w, (k // 2) * h, (k % 2 + 1) * w, (k // 2 + 1) * h))
        put(f'tower_{t}_{k}', fit(crop(isolate(cell)), 300))
    print('tower', t)
for t, bg in [('prism', MAG), ('mortar', MAG), ('frost', MAG), ('storm', MAG), ('grove', MAG), ('conduit', GRN), ('void', GRN)]:
    p = os.path.join(GEN, f'tower2_{t}.png')
    if not os.path.exists(p):
        continue
    sheet = key(Image.open(p), bg)
    w, h = sheet.width // 2, sheet.height // 2
    for k in range(3):  # tier 2, branch A ascended, branch B ascended
        cell = sheet.crop(((k % 2) * w, (k // 2) * h, (k % 2 + 1) * w, (k // 2 + 1) * h))
        put(f'tower_{t}_{4 + k}', fit(crop(isolate(cell)), 300))
    print('tower tiers', t)
# ---------------------------------------------------------------- enemies
for sheetname, bg, cols, rows, types in [('enemies_a', MAG, 3, 2, ['husk', 'skitter', 'bulwark', 'swarm', 'aegis', 'brood']),
                                        ('enemies_b', GRN, 2, 2, ['shrike', 'blinker', 'mender', 'phantom'])]:
    p = os.path.join(GEN, sheetname + '.png')
    if not os.path.exists(p):
        continue
    sheet = key(Image.open(p), bg)
    w, h = sheet.width // cols, sheet.height // rows
    BOX = {'mender': (0, 0.5, 0.45, 1), 'phantom': (0.45, 0.5, 1, 1)}  # the phantom's tail crosses the grid line
    for k, ty in enumerate(types):
        if ty in BOX:
            fx0, fy0, fx1, fy1 = BOX[ty]; cell = sheet.crop((int(fx0 * sheet.width), int(fy0 * sheet.height), int(fx1 * sheet.width), int(fy1 * sheet.height)))
        else:
            cell = sheet.crop(((k % cols) * w, (k // cols) * h, (k % cols + 1) * w, (k // cols + 1) * h))
        put('enemy_' + ty, fit(crop(cell), 180))
    print('enemies', sheetname)
ANIM_BG = {'husk': MAG, 'skitter': MAG, 'bulwark': MAG, 'swarm': MAG, 'aegis': MAG, 'brood': MAG, 'shrike': GRN, 'blinker': GRN, 'mender': GRN, 'phantom': GRN}
for ty, bg in ANIM_BG.items():
    p = os.path.join(GEN, f'anim_{ty}.png')
    if not os.path.exists(p):
        continue
    sheet = key(Image.open(p), bg); w, h = sheet.width // 2, sheet.height // 2
    for k in range(4):
        put(f'enemy_{ty}_f{k}', fit(crop(isolate(sheet.crop(((k % 2) * w, (k // 2) * h, (k % 2 + 1) * w, (k // 2 + 1) * h)))), 180))
    print('anim', ty)
for b, bg in [('nullwarden', GRN), ('magmaw', MAG)]:
    p = os.path.join(GEN, f'bossanim_{b}.png')
    if os.path.exists(p):
        sheet = key(Image.open(p), bg); w, h = sheet.width // 2, sheet.height // 2
        for k in range(4):
            put(f'enemy_{b}_p{k}', fit(crop(sheet.crop(((k % 2) * w, (k // 2) * h, (k % 2 + 1) * w, (k // 2 + 1) * h))), 420))
        print('boss poses', b)
for b, bg in [('nullwarden', GRN), ('magmaw', MAG)]:
    p = os.path.join(GEN, f'boss_{b}.png')
    if os.path.exists(p):
        put('enemy_' + b, fit(crop(key(Image.open(p), bg)), 420)); print('boss', b)

# ---------------------------------------------------------------- art-derived grid: Skyreach islands follow the painting
grid = {}
p = os.path.join(GEN, 'map_skyreach.png')
if os.path.exists(p):
    a = np.asarray(Image.open(p).convert('RGB').resize((1920, 1088), Image.LANCZOS)).astype(np.float32)
    void = []
    for r in range(17):
        for c in range(30):
            t = a[r * 64 + 8:r * 64 + 56, c * 64 + 8:c * 64 + 56].reshape(-1, 3)
            sky = ((t[:, 2] > t[:, 0] + 25) & (t[:, 2] > t[:, 1] + 5)).mean()
            if sky > 0.5: void.append(r * 30 + c)
    grid['skyreach'] = {'void': void}
    print('skyreach void tiles', len(void))
with open(os.path.join(ROOT, 'js', 'assets.js'), 'w', encoding='utf-8') as f:
    f.write('// Generated by tools/buildart.py — painted art embedded as data URIs. Do not edit by hand.\n')
    f.write('(function (AS) { AS.ASSETS = ' + json.dumps(assets) + '; })(AS);\n')
with open(os.path.join(ROOT, 'js', 'asset_manifest.js'), 'w', encoding='utf-8') as f:
    f.write('// Generated by tools/buildart.py — names of the painted assets in assets/*.webp (served as separate cacheable files over http).\n')
    f.write('(function (AS) { AS.ASSET_FILES = ' + json.dumps(sorted(assets)) + ';\n  AS.ASSET_SIZES = ' + json.dumps(meta) + ';\n  AS.ART_GRID = ' + json.dumps(grid) + '; })(AS);\n')
print('assets.js', round(sum(len(v) for v in assets.values()) / 1e6, 2), 'MB,', len(assets), 'images')
