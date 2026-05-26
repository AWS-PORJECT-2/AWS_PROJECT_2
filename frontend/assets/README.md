# 메인 페이지 자산 가이드

`main.html` (메인 페이지) 가 우선 참조하는 정적 자산 경로.
파일이 없으면 자동으로 SVG fallback 으로 표시되므로 안전하다.

## 카테고리 아이콘 (좌측 카테고리 행 + 우측 순위 fallback)

사용자가 첨부한 흰색 둥근 카드 안 그라데이션 아이콘 한 장(과잠/반팔티/에코백 3개 정사각형)을 잘라서 아래 파일명으로 저장:

| 파일 경로 | 내용 |
| --- | --- |
| `frontend/assets/jacket.png` | 보라 그라데이션 과잠 (정사각, 22% 라운드 카드) |
| `frontend/assets/tshirt.png` | 보라→시안 가로 그라데이션 반팔티 |
| `frontend/assets/ecobag.png` | 시안 그라데이션 에코백 |

권장 해상도: 240×240 px (또는 그 이상의 정사각형). PNG 권장 (투명 배경).

## doothing 브랜드 이미지 (슬로건 옆)

| 파일 경로 | 내용 |
| --- | --- |
| `frontend/assets/doothing-brand.png` | "doothing" 로고 + 펜 일러스트 |

권장 해상도: 가로 700~900 px, PNG 투명 배경 권장.

## 게시물 모델 사진

현재 `main.js` 의 `POPULAR_RANKING` / `NEW_PICKS` 데이터는
`https://picsum.photos/seed/...` placeholder 를 쓰고 있다.
실제 모델 사진이 준비되면 각 항목의 `img` / `model` 필드 URL 만
교체하면 된다 (예: `'/assets/model-jacket-1.jpg'`).
