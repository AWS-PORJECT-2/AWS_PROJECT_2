"""
'버튼 아이콘.png' 합본을 jacket/tshirt/ecobag 3개 정사각 PNG로 분리.
각 조각을 투명 가장자리 트리밍 후 같은 비율의 정사각 캔버스에 중앙 배치.
"""
from PIL import Image
import os


def trim_alpha(img, thr=8):
    px = img.load()
    w, h = img.size
    top, bot, lf, rt = h, 0, w, 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > thr:
                if x < lf: lf = x
                if x > rt: rt = x
                if y < top: top = y
                if y > bot: bot = y
    if rt < lf or bot < top:
        return img
    return img.crop((lf, top, rt + 1, bot + 1))


here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "버튼 아이콘.png")
img = Image.open(src).convert("RGBA")
w, h = img.size
third = w // 3

names = ["jacket.png", "tshirt.png", "ecobag.png"]
boxes = [(0, 0, third, h), (third, 0, third * 2, h), (third * 2, 0, w, h)]

# 트리밍 후 가장 큰 한 변을 기준 캔버스 크기로 통일 (세 아이콘이 시각적으로 같은 크기)
trimmed_list = []
for box in boxes:
    s = img.crop(box)
    t = trim_alpha(s)
    trimmed_list.append(t)
    print(f"  trim {box} -> {t.size}")

max_side = max(max(t.size) for t in trimmed_list)
canvas_side = int(max_side * 1.12)  # 12% 마진
print(f"canvas_side = {canvas_side}")

for name, t in zip(names, trimmed_list):
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    sw, sh = t.size
    cx = (canvas_side - sw) // 2
    cy = (canvas_side - sh) // 2
    canvas.paste(t, (cx, cy), t)
    out = os.path.join(here, name)
    canvas.save(out)
    print(f"[OK] {name}: {t.size} centered in {canvas.size}")
print("Done.")
