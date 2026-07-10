# DOOTHING UI/UX 리마스터링 — 변경 정리 (loun 브랜치)

> 기존 "국민대 공동구매(와디즈 클론)" 앱을 **인스타그램 스타일 크리에이터 커뮤니티 & 드롭 커머스**로 리마스터링.
> 원칙: **기존 백엔드/결제/인증은 최대한 재사용**, 프론트 스킨 교체 + 신규 테이블(프렌드십/스토리)만 추가.

---

## 한눈에 보기

| 영역 | 변경 |
|------|------|
| 테마 | 보라 → **무광 블랙(#1A1A1A) & 화이트 모노톤** |
| 홈 | 와디즈 그리드 → **다크 릴스(인스타) 피드** + 스토리 링 |
| 탐색 | 라이트 피드 → **다크 사진 그리드 + 필터칩** |
| 프로필 | 사이드바 → **다크 Archive 2탭(내가 만든/탑승한)** |
| 제작 | **샘플 스튜디오(마플 클론)** + **드롭 오픈(인스타 3-Step)** |
| 소셜 | 팔로우 → **크루십(상호 수락)** + 하트 알림 센터 |
| 신규 | **24시간 스토리 & 투표** (풀스택) |

---

## 실행 방법 (로컬)

```bash
cd server
# .env 필요 (아래 최소 설정). PostgreSQL 연결 시 신규 마이그레이션 실행 필요.
npm install
npm run dev     # http://localhost:3000
npm test        # vitest — 좋아요 캡 / 프렌드십 속성 테스트
```

로컬 dev `.env` 최소값:
```
NODE_ENV=development
USE_MOCK_OAUTH=true
ALLOW_ANY_EMAIL_DOMAIN=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
DATABASE_SSL=disabled
```

**신규 마이그레이션(적용 필요):**
- `server/migrations/047_friendship.sql` — follows에 `status` 컬럼(크루십)
- `server/migrations/048_stories.sql` — stories / story_votes 테이블(스토리·투표)

---

## 백엔드 변경 (신규 테이블 + 프렌드십만, 코어 무변경)

### 1. 크루십 (팔로우 → 상호 수락)
- `migrations/047_friendship.sql`: `follows.status` (`pending`|`accepted`, 기존 행은 `accepted`로 보존)
- `repositories/pg-follow-repository.ts` + `follow-repository.ts`: `upsertFollow / setStatus / getStatus / areFriends` 추가
- `routes/users-routes.ts`: 크루십 핸들러 추가
  - `GET /api/users/:id/friend` — 관계 상태(none/requested/incoming/friends)
  - `POST /api/users/:id/friend` — 요청(맞요청 시 즉시 수락), self 요청 400
  - `POST /api/users/:id/friend/accept` — 수락(양방향 accepted)
  - `DELETE /api/users/:id/friend` — 요청취소/거절/끊기
  - `GET /api/me/friend-requests` — 받은 요청 목록(하트 알림 센터용)

### 2. 스토리 & 투표 (신규, 24시간 휘발성)
- `migrations/048_stories.sql`: `stories`(24h expires_at), `story_votes`(1인1표)
- `repositories/pg-story-repository.ts`: 크루(상호 accepted)끼리만 조회, 투표 집계, 만료 정리
- `routes/stories.ts`:
  - `GET /api/stories` — 내 크루+본인 살아있는 스토리
  - `POST /api/stories` — 업로드(이미지 + 투표 스티커)
  - `POST /api/stories/:id/vote` — 투표(option 0/1, upsert 동시성 제어)
- `app.ts`: 라우트 등록 + 만료 스토리 자동 purge(부팅 + 1시간마다) + `/api/stories` 대용량 바디 허용

### 3. 테스트 (신규)
- `server/src/shared/display-format.ts` + `.test.ts` — 좋아요 99+ 캡 (fast-check 속성 테스트)
- `server/src/shared/friendship.test.ts` — 크루십 상태 전이(대칭성 P4, pending 비대칭 P5)
- `package.json`: `test`/`test:watch` 스크립트, devDeps `vitest`·`fast-check`

> **건드리지 않은 것**: 회원가입/OAuth/JWT 세션, 결제(토스/무통장), 펀드 생성 API, 좋아요/찜 API. 전부 기존 그대로.

---

## 프론트엔드 변경

### 공통 스킨
- `tokens.css` — `--c-primary-*` 값을 보라 → 모노톤 그레이스케일로 재정의(변수명 유지 → 전 페이지 자동 리스킨), 알약 곡률/스트릿 폰트 토큰 추가
- `doothing.css` **(신규)** — 스킨 최종 override 레이어: 알약 버튼, 플로팅 내비, 바텀시트, 하트 알림 센터, 체크아웃 모달, 로고 반전, 마이너스 엔지니어링 숨김(`.dt-hidden` + 복잡 필터 숨김)
- 전 페이지 `<head>`에 `doothing.css` + Permanent Marker 폰트 로드
- `assets/logo-doothing.png` — 신규 브랜드 로고(다크 헤더에서 흰색 반전)

### 공통 셸 (`wz-core.js`)
- 하단 **플로팅 알약 내비**(4버튼: 홈/검색/+/프로필) + 중앙 [+] **바텀시트**(SAMPLE STUDIO / DROP OPEN / STORY)
- **하트 알림 센터**(`openHeartCenter`) — 크루 요청(수락/거절) + 활동
- `formatLikeCount` — 좋아요 100+ → `99+`
- 네이밍: 프로젝트 만들기→MAKE IT, 게시판→Lookbook, 관심→좋아요, 로고 교체

### 홈 (다크 릴스 피드) — `main.html`
- `wz-lookbook.js` / `wz-lookbook.css` **(신규)**: 다크 헤더 + 스토리 링 + 크루 프로필 + LIVE DROP 뱃지 + 착장샷 + GET DROP CTA + 좋아요(99+)/댓글/북마크
- GET DROP → 상세 없이 `WZCheckout`로 **기존 펀딩 참여 흐름** 실행
- 크루 프로필 클릭 → 상대 메이커 프로필로 이동
- 실데이터(`/api/groupbuys`) 없으면 데모 시드로 시연

### 탐색/검색 — `feed.html`
- `wz-explore.js` / `wz-explore.css` **(신규)**: 다크 검색바 + 필터칩(LIVE DROP/오버핏/…) + ALL DROPS 사진 2열 그리드
- 게시물/LIVE DROP 클릭 → 메인 릴스 피드로 해당 게시물 얹어 이동

### 프로필 Archive — `profile.html`
- `wz-archive.js` / `wz-archive.css` **(신규)**: 다크 @핸들 + 스탯(크루/드롭/탑승) + MADE/BOARDED 2탭 + 카드 그리드
- 상단 **하트(알림) + 햄버거(설정)** 아이콘, 상태 뱃지 LIVE DROP/DONE/FAIL/UPCOMING
- (기존 `wz-profile.js`는 유지 — 라벨만 크루/좋아요로 조정)

### 샘플 스튜디오 (마플 클론) — `studio.html`
- `wz-studio.js` / `wz-studio.css` **(신규)**: 상단바 + 좌측 안내 + 중앙 티셔츠 캔버스(이미지 업로드 드래그/리사이즈) + 우측 세로 툴바 + 상품 패널(색상/사이즈/수량/배송비/장바구니)
- 장바구니 → sessionStorage 상태 전달 후 **기존 결제 진입점**(`addresses.html?flow=sample`)

### 드롭 오픈 (인스타 3-Step) — `drop.html`
- `wz-drop.js` / `wz-drop.css` **(신규)**:
  1. 사진 다중 선택 + CSS 무드 필터(흑백/빈티지/쿨톤/스트릿/페이드)
  2. 스토리 textarea + 해시태그 + 카테고리(반팔티) + 디자인 태깅
  3. 베이스가(15,000원) + 크리에이터 마진 슬라이더 → 최종가 실시간 → **기존 `POST /api/funds`** 로 발행

### 크루십 버튼 — `wz-maker.js`
- 팔로우 버튼 → **크루 요청/요청됨/크루 수락/크루 ✓** (상태별, `/api/users/:id/friend` 연결)
- 통계 라벨 팔로워 → 크루

### 상세 페이지 대체 — `wz-checkout.js` **(신규)**
- 상세 페이지 없이 어디서든 GET DROP → 리워드 자동선택/선택 → 배송지 → **기존 `/api/funds/:id/back`** → 완료 모달
- 결제 프론트는 100% 기존 것 재사용

### 스토리 & 투표 (프론트) — `wz-story.js` / `wz-story.css` **(신규)**
- 상단 스토리 링(안읽음 흰 링), 풀스크린 뷰어(24h 진행바/탭 이동/스와이프 닫기), 투표 스티커(드래그 배치 + 실시간 % + 햅틱)
- 작성자 아이콘 클릭 → 상대 프로필 이동

---

## 스펙 문서
`.kiro/specs/doothing-ui-renewal/` 에 requirements / design / tasks 정리됨.

---

## 남은 작업 / 확인 필요
- **DB 마이그레이션 적용**: 047, 048 (크루십/스토리는 DB 연결 시 동작)
- **샘플 스튜디오 결제 연동**: 현재 프론트에서 결제 진입점까지 라우팅. 샘플 단품 주문을 기존 주문 API에 태우려면 추가 연동 필요(백엔드 결정 대기)
- 데모 시드(unsplash 이미지)는 실데이터 없을 때 시연용 — 실제 승인된 드롭이 있으면 실데이터로 대체됨
