#!/usr/bin/env python3
"""Crests, colours and credits for the colleges added in backend/Code.gs.

For each college it finds the coat of arms on Wikidata (property P94), fetches it from
Wikimedia Commons as a PNG thumbnail, fits it in the same 104 x 130 box as the crests
already in index.html, and prints the lines to paste into CREST_DATA, CREDITS and INFO.

The colour follows index.html's rule ("the commonest strongly coloured pixel of the crest"),
then is toned the way the existing colours were: in OKLCH, L' = 0.185 + 0.65 L and
C' = 0.052 + 0.585 C, hue kept. `--check` runs that on the crests already in index.html
and prints what it would pick next to the colour that is there, so it can be judged.

Needs Pillow (pip install pillow) and access to wikidata.org and wikimedia.org.

    python3 tools/new_college_crests.py            # print the snippets
    python3 tools/new_college_crests.py --check    # try the colour rule on the existing crests
    python3 tools/new_college_crests.py --file homerton="Some other file.svg"   # use a different Commons file
"""
import base64, colorsys, html, io, json, math, re, sys, urllib.parse, urllib.request
from collections import Counter
from pathlib import Path

from PIL import Image

UA = 'CamCaffs-crests/1.0 (https://camcaffs.co.uk; crest thumbnails for the menu page)'
BOX = (104, 130)
INDEX = Path(__file__).resolve().parent.parent / 'index.html'

# id: (English Wikipedia article, the name used in CREDITS, the dining hall's position)
# Positions are the dining hall building itself, from the University map and OpenStreetMap
# (as recorded by grub.cam, supabase/migrations/0012_venue_locations.sql).
COLLEGES = {
    'fitzwilliam':  ('Fitzwilliam College, Cambridge', 'Fitzwilliam', 52.21545, 0.10597),
    'homerton':     ('Homerton College, Cambridge', 'Homerton', 52.18577, 0.13444),
    'pembroke':     ('Pembroke College, Cambridge', 'Pembroke', 52.20189, 0.11885),
    'peterhouse':   ('Peterhouse, Cambridge', 'Peterhouse', 52.20080, 0.11857),
    'stcatharines': ("St Catharine's College, Cambridge", "St Catharine's", 52.20314, 0.11651),
    'lucycavendish': ('Lucy Cavendish College, Cambridge', 'Lucy Cavendish', 52.21149, 0.10947),
}


def get(url, params=None):
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def arms_file(article):
    """The Commons file name of the article's coat of arms (Wikidata P94), or None."""
    d = json.loads(get('https://www.wikidata.org/w/api.php', {
        'action': 'wbgetentities', 'sites': 'enwiki', 'titles': article,
        'props': 'claims', 'format': 'json'}))
    for ent in d.get('entities', {}).values():
        for prop in ('P94', 'P154'):          # coat of arms image, else logo image
            for c in ent.get('claims', {}).get(prop, []):
                v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
                if v:
                    return v
    return None


def commons_search(name):
    d = json.loads(get('https://commons.wikimedia.org/w/api.php', {
        'action': 'query', 'list': 'search', 'srnamespace': 6, 'srlimit': 8,
        'srsearch': name + ' Cambridge arms shield crest', 'format': 'json'}))
    return [s['title'][5:] for s in d.get('query', {}).get('search', [])]


def commons_info(filename):
    d = json.loads(get('https://commons.wikimedia.org/w/api.php', {
        'action': 'query', 'titles': 'File:' + filename, 'prop': 'imageinfo',
        'iiprop': 'url|extmetadata', 'iiurlwidth': BOX[0] * 3, 'format': 'json'}))
    page = next(iter(d['query']['pages'].values()))
    ii = page['imageinfo'][0]
    meta = ii.get('extmetadata', {})
    plain = lambda k: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', meta.get(k, {}).get('value', '')))).strip()
    return {
        'thumb': ii.get('thumburl') or ii['url'],
        'page': ii['descriptionurl'],
        'lic': plain('LicenseShortName') or 'see file page',
        'artist': plain('Artist') or 'unknown',
    }


def crest_webp(png):
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    bbox = im.getchannel('A').getbbox()          # trim empty margins, as the existing crests are
    if bbox:
        im = im.crop(bbox)
    im.thumbnail(BOX, Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, 'WEBP', quality=82, method=6)
    return im, 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode()


# ---- colour ----

def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    c = c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return max(0, min(255, round(c * 255)))


def to_oklch(rgb):
    r, g, b = (_lin(x) for x in rgb)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.atan2(bb, a)


def from_oklch(L, C, h):
    a, b = C * math.cos(h), C * math.sin(h)
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    return rgb


def tone(rgb):
    """The crest's colour as a tab colour: a little darker and calmer, same hue."""
    L, C, h = to_oklch(rgb)
    L, C = 0.185 + 0.65 * L, 0.052 + 0.585 * C
    while C > 0:                                  # pull chroma in until it fits sRGB
        lin = from_oklch(L, C, h)
        if all(-1e-4 <= x <= 1 + 1e-4 for x in lin):
            break
        C -= 0.002
    return '#%02X%02X%02X' % tuple(_gam(max(0, min(1, x))) for x in from_oklch(L, C, h))


def strong_pixels(im):
    """The crest's strongly coloured pixels, commonest first."""
    cnt = Counter()
    for r, g, b, a in im.convert('RGBA').getdata():
        if a >= 250 and max(r, g, b) - min(r, g, b) >= 60:
            cnt[(r, g, b)] += 1
    return [p for p, _ in cnt.most_common(3)]


def check():
    lines = INDEX.read_text(encoding='utf-8').split('\n')
    crest_line = next(l for l in lines if l.startswith('const CREST_DATA'))
    crests = json.loads(crest_line[crest_line.index('{'):crest_line.rindex('}') + 1])
    src = '\n'.join(lines)
    info = dict(re.findall(r'(\w+):\s*\{[^}]*?c:"(#[0-9A-Fa-f]{6})"', src[src.index('const INFO'):src.index('const CREST_DATA')]))
    print('id          now      rule     (from the commonest strong pixels)')
    for k, uri in crests.items():
        im = Image.open(io.BytesIO(base64.b64decode(uri.split(',', 1)[1])))
        px = strong_pixels(im)
        guess = tone(px[0]) if px else '-'
        print(f"{k:11} {info.get(k, '-'):8} {guess:8} {' '.join('#%02X%02X%02X' % p for p in px)}")


def main(argv):
    if '--check' in argv:
        return check()
    # --file homerton="Some file.svg" (the shell hands over: --file, homerton=Some file.svg)
    override = dict(a.split('=', 1) for a in argv if '=' in a and not a.startswith('--'))
    crest_out, credit_out, info_out = [], [], []
    for cid, (article, name, lat, lng) in COLLEGES.items():
        f = override.get(cid, '').strip('"') or arms_file(article)
        if not f:
            print(f'# {name}: no coat of arms on Wikidata. Commons has: {commons_search(name)}', file=sys.stderr)
            print(f'#   rerun with --file {cid}="<one of them>"', file=sys.stderr)
            info_out.append(f'  {cid + ":":13} {{ lat:{lat:.5f}, lng:{lng:.5f}, c:"#6B7280" }},')
            continue
        meta = commons_info(f)
        im, uri = crest_webp(get(meta['thumb']))
        px = strong_pixels(im)
        colour = tone(px[0]) if px else '#6B7280'
        crest_out.append(f'"{cid}": "{uri}"')
        credit_out.append(json.dumps({'college': name, 'file': f, 'lic': meta['lic'],
                                      'artist': meta['artist'], 'page': meta['page']}, ensure_ascii=False))
        info_out.append(f'  {cid + ":":13} {{ lat:{lat:.5f}, lng:{lng:.5f}, c:"{colour}" }},')
        print(f'# {name}: {f} ({im.width}x{im.height}, {meta["lic"]}); commonest strong pixels '
              + ' '.join('#%02X%02X%02X' % p for p in px) + f' -> {colour}', file=sys.stderr)
    print('/* INFO: add inside const INFO = { ... } */')
    print('\n'.join(info_out))
    print('\n/* CREST_DATA: add these keys to the object */')
    print(',\n'.join(crest_out))
    print('\n/* CREDITS: add these to the array */')
    print(',\n'.join(credit_out))


if __name__ == '__main__':
    main(sys.argv[1:])
