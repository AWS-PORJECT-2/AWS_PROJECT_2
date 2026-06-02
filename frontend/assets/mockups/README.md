# 디자인하기 — 상품 목업 이미지

디자인 에디터(design.html)가 캔버스 배경으로 쓰는 상품 목업. 모두 **1248×1248 (1:1)** 기준.
파일이 없으면 SVG 폴백으로 자동 대체됩니다.

## 파일 이름 규칙
`/assets/mockups/<상품img>_<면>.png` — 면: `front` `back` `left` `right` `neck` `wrap`

design.js 의 `PRODUCTS` 가 카테고리 → 상품(img/면/인쇄영역)을 정의합니다. 현재 매핑:

| 카테고리 | 상품(img) | 면 |
|---|---|---|
| jacket | varsity_jacket | front/back/left/right |
| hoodie | hoodie, sweatshirt | front/back/left/right |
| tshirt | tshirt | front/back/left/right/neck |
| ecobag | ecobag | front/back |
| keyring | keyring, keyring_round, keyring_square, keyring_strap | front |
| phonecase | phonecase | back |
| sticker | sticker_sheet | front |
| badge | badge | front |
| tumbler | tumbler(front/left/right/wrap), mug(front/left/right) | |
| fabric | blanket | front |
| doll | mascot | front/back/left/right |
| accessory | accessory | front |
| webapp/etc | (없음 → SVG) | front |

## 인쇄 영역 조정
각 상품·면의 점선 인쇄영역은 `design.js` 의 `PRODUCTS[...].print[view] = pr(left, top, width, height)`(캔버스 대비 %)로 정의.
이미지와 안 맞으면 해당 좌표만 수정하면 됩니다.
