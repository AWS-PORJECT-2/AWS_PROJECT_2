# tools

## gen-mockup-colors.py
디자인하기 색상 목업 생성기. `frontend/assets/mockups/<img>_<view>.jpg`(흰색 원본)에서
아이템별 정밀 마스크(그림자·구멍·고정부 제외)를 만들고 8색 멀티플라이 이미지 + 실루엣 마스크를 생성.

```
python3 tools/gen-mockup-colors.py   # frontend/assets/mockups/ 에 __<key>.jpg + _mask.png 출력
```
색/카브 파라미터는 스크립트 상단 COLORS, carve() 에서 조정. 의존성: numpy, scipy, pillow.
