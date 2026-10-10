"""Download the bundled Letters fonts from Google Fonts and pin variable fonts to one weight.

Every font is SIL Open Font License. Variable fonts are cut to a fixed instance with
fontTools so opentype.js and HarfBuzz see exactly the same outlines everywhere.

Usage (needs Python 3 and `pip install fonttools`):
    python scripts/fonts/build-fonts.py
Writes public/fonts/<file>.ttf, public/fonts/licenses/<id>-OFL.txt and copies the two
test fixtures to lib/letters/__tests__/fonts/.
"""
import io
import os
import shutil
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "fonts")
LIC = os.path.join(OUT, "licenses")
FIXTURES = os.path.join(ROOT, "lib", "letters", "__tests__", "fonts")
BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

# id, google/fonts folder, source file, output file, axis pins (None = static font)
FONTS = [
    ("fredoka", "fredoka", "Fredoka[wdth,wght].ttf", "Fredoka-Bold.ttf", {"wght": 700, "wdth": 100}),
    ("baloo2", "baloo2", "Baloo2[wght].ttf", "Baloo2-ExtraBold.ttf", {"wght": 800}),
    ("archivo-black", "archivoblack", "ArchivoBlack-Regular.ttf", "ArchivoBlack-Regular.ttf", None),
    ("anton", "anton", "Anton-Regular.ttf", "Anton-Regular.ttf", None),
    ("bebas-neue", "bebasneue", "BebasNeue-Regular.ttf", "BebasNeue-Regular.ttf", None),
    ("pacifico", "pacifico", "Pacifico-Regular.ttf", "Pacifico-Regular.ttf", None),
    ("vazirmatn", "vazirmatn", "Vazirmatn[wght].ttf", "Vazirmatn-Black.ttf", {"wght": 900}),
    ("lalezar", "lalezar", "Lalezar-Regular.ttf", "Lalezar-Regular.ttf", None),
    ("noto-sans-arabic", "notosansarabic", "NotoSansArabic[wdth,wght].ttf", "NotoSansArabic-Black.ttf", {"wght": 900, "wdth": 100}),
    ("noto-naskh-arabic", "notonaskharabic", "NotoNaskhArabic[wght].ttf", "NotoNaskhArabic-Bold.ttf", {"wght": 700}),
]
FIXTURE_FILES = ["Fredoka-Bold.ttf", "Vazirmatn-Black.ttf"]


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def main():
    os.makedirs(LIC, exist_ok=True)
    os.makedirs(FIXTURES, exist_ok=True)
    for fid, folder, src, out, pins in FONTS:
        data = fetch(BASE + folder + "/" + urllib.request.quote(src))
        font = TTFont(io.BytesIO(data))
        if pins:
            font = instancer.instantiateVariableFont(font, pins, updateFontNames=False)
        font.save(os.path.join(OUT, out))
        with open(os.path.join(LIC, fid + "-OFL.txt"), "wb") as f:
            f.write(fetch(BASE + folder + "/OFL.txt"))
        print("wrote", out, "(pinned %s)" % pins if pins else "")
    for name in FIXTURE_FILES:
        shutil.copyfile(os.path.join(OUT, name), os.path.join(FIXTURES, name))
        print("fixture", name)


if __name__ == "__main__":
    main()
