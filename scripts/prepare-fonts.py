"""Fetch only the glyphs used by this page; runtime has no font CDN dependency."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
import re
from io import BytesIO
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'fonts'
out.mkdir(parents=True, exist_ok=True)
text = ''.join((root / 'src' / name).read_text() for name in ['quiz.ts', 'main.ts'])
glyphs = ''.join(sorted({c for c in text if ord(c) > 127})) + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789·。，？、'
fonts = [
    ('question', 'Ma Shan Zheng', glyphs, 'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/OFL.txt'),
    ('text', 'LXGW WenKai TC', glyphs, 'https://raw.githubusercontent.com/google/fonts/main/ofl/lxgwwenkaitc/OFL.txt'),
    ('roman', 'Cormorant Garamond', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt'),
]
headers = {'User-Agent': 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}
for name, family, chars, license_url in fonts:
    url = 'https://fonts.googleapis.com/css2?' + urlencode({'family':family, 'text':chars, 'display':'swap'})
    css = urlopen(Request(url, headers=headers), timeout=30).read().decode()
    match = re.search(r'url\((https://[^)]+)\)', css)
    if not match: raise RuntimeError('No font returned for '+family)
    data = urlopen(Request(match.group(1), headers=headers), timeout=30).read()
    font = TTFont(BytesIO(data))
    font.flavor = 'woff'
    font.save(out / (name+'.woff'))
    license_data = urlopen(Request(license_url, headers=headers), timeout=30).read()
    (out / ('OFL-'+name+'.txt')).write_bytes(license_data)
    print(name, len(data), 'bytes')
