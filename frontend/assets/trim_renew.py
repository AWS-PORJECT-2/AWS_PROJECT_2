"""left/right renew 두 이미지의 투명 가장자리 트리밍."""
from PIL import Image
import os


def trim_transparent(img, alpha_threshold=8):
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    top, bottom, left, right = h, 0, w, 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > alpha_threshold:
                if x < left:   left = x
                if x > right:  right = x
                if y < top:    top = y
                if y > bottom: bottom = y
    if right < left or bottom < top:
        return img
    return img.crop((left, top, right + 1, bottom + 1))


here = os.path.dirname(os.path.abspath(__file__))
for name in ["left text renew.png", "right text renew.png"]:
    p = os.path.join(here, name)
    if not os.path.exists(p):
        print(f"[skip] {p}")
        continue
    im = Image.open(p).convert("RGBA")
    t = trim_transparent(im)
    t.save(p)
    print(f"[OK] {name}: {im.size} -> {t.size}")
