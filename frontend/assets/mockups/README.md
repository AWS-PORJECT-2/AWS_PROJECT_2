# 디자인하기 — 카테고리별 기본 목업 이미지

디자인 에디터(design.html)가 캔버스 배경으로 쓰는 상품 목업 이미지를 여기에 넣으세요.
파일이 없으면 자동으로 SVG 실루엣(임시 도안)으로 대체되며, 파일을 넣으면 즉시 그 사진을 사용합니다.

## 파일 이름 규칙

`/assets/mockups/<카테고리slug>-<면>.png`

- **면**: 의류는 `front`, `back` 두 장. 굿즈는 `front` 한 장.

### 의류 (앞/뒤 2장씩)
- `jacket-front.png`, `jacket-back.png` — 과잠
- `hoodie-front.png`, `hoodie-back.png` — 후드티·맨투맨
- `tshirt-front.png`, `tshirt-back.png` — 반팔티

### 굿즈 (front 1장)
- `ecobag-front.png` — 에코백
- `keyring-front.png` — 키링·스트랩
- `phonecase-front.png` — 폰케이스
- `sticker-front.png` — 스티커·문구
- `badge-front.png` — 뱃지·배지
- `tumbler-front.png` — 텀블러·머그
- `fabric-front.png` — 담요·패브릭
- `doll-front.png` — 인형·마스코트
- `accessory-front.png` — 액세서리
- `webapp-front.png`, `etc-front.png` — 웹/앱·기타 (선택)

## 권장 사양

- **의류**: 세로형, 비율 **5:6** (예: 1000×1200px). 흰색/단색 무지 상품을 중앙에 배치.
- **굿즈**: 정사각형, 비율 **1:1** (예: 1000×1000px). 상품을 중앙에 배치.
- **배경 투명(PNG)** 권장 — 캔버스 흰 배경 위에 깔끔하게 얹힙니다.
- 디자인이 잘 보이도록 **밝은/무지 상품** 사진이 좋습니다(인쇄 영역이 또렷하게 보임).

## 인쇄 영역 위치 조정

각 상품의 점선 "인쇄 영역" 기본 위치는 `design.js`의 `PRINT`(family 기준)와
`PRINT_OVERRIDE`(slug별 미세조정)로 정의됩니다. 이미지 올린 뒤 위치가 안 맞으면
해당 slug를 `PRINT_OVERRIDE`에 `{ front: { l, t, w, h } }` (캔버스 대비 %)로 넣어 맞추면 됩니다.
