"""
PNG 배경 누끼 — 가장자리 흰색/연회색 체크 배경을 투명으로 변환.

- Flood fill 방식: 네 모서리에서 시작해 비슷한 색을 따라가며 투명 처리
- 색 거리(distance) 기준: 기본 24
- 안쪽 일러스트(보라/하늘/민트)는 보존
"""

from PIL import Image
from collections import deque
import os
import sys


def remove_bg(src_path, dst_path=None, tolerance=24):
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    px = img.load()

    # 모서리 평균색을 배경색 후보로 사용
    samples = [
        px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1],
        px[w // 2, 0], px[w // 2, h - 1], px[0, h // 2], px[w - 1, h // 2],
    ]
    bg = (
        sum(s[0] for s in samples) // len(samples),
        sum(s[1] for s in samples) // len(samples),
        sum(s[2] for s in samples) // len(samples),
    )

    visited = [[False] * h for _ in range(w)]
    q = deque()

    # 모서리 픽셀들에서 BFS 시작
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        q.append((x, y))

    def is_bg(c):
        return (
            abs(c[0] - bg[0]) <= tolerance
            and abs(c[1] - bg[1]) <= tolerance
            and abs(c[2] - bg[2]) <= tolerance
        )

    cleared = 0
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        if visited[x][y]:
            continue
        visited[x][y] = True

        c = px[x, y]
        if not is_bg(c):
            continue

        px[x, y] = (c[0], c[1], c[2], 0)  # 투명 처리
        cleared += 1

        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    if dst_path is None:
        base, ext = os.path.splitext(src_path)
        dst_path = base + "_transparent" + ext
    img.save(dst_path)
    print(f"[OK] {src_path} -> {dst_path}  (cleared {cleared} px, bg={bg})")
    return dst_path


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    targets = sys.argv[1:] or ["left_text_image.png", "right_doothing_image.png"]
    for t in targets:
        full = os.path.join(here, t)
        if not os.path.exists(full):
            print(f"[skip] not found: {full}")
            continue
        # 같은 파일명에 덮어쓰기
        remove_bg(full, full)
