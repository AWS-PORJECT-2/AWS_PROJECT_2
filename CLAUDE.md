# 두띵(Doothing) — 국민대학교 공동구매 플랫폼

## 프로젝트 개요

국민대학교 학생 전용 공동구매 웹 플랫폼. 과잠, 후드티, 키링 등 공동구매 개설/참여/관리 + AI 디자인 생성(예정).

- **GitHub**: https://github.com/AWS-PORJECT-2/AWS_PROJECT_2
- **팀**: 이로운(팀장), 이상진, 조영건 — 국민대학교

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | HTML / CSS / Vanilla JS (모바일·PC 반응형, 프레임워크 없음) |
| 백엔드 | Node.js + Express + TypeScript (tsx로 dev 실행) |
| 데이터베이스 | PostgreSQL (AWS RDS) |
| 인증 | Google OAuth 2.0 + JWT (httpOnly 쿠키) |
| 보안 | helmet, cors, express-rate-limit |
| 로깅 | pino |
| AI (예정) | ComfyUI (디자인 생성), CatVTON (가상 피팅) |

---

## 프로젝트 구조

```
├── server/              # 백엔드 (Express + TypeScript)
│   ├── src/
│   │   ├── app.ts           # Express 앱 생성 + DI 와이어링
│   │   ├── server.ts        # 서버 시작점
│   │   ├── db.ts            # PostgreSQL 연결 (pg Pool)
│   │   ├── logger.ts        # pino 로거
│   │   ├── types/           # 엔티티 인터페이스 (한 파일당 한 엔티티)
│   │   ├── interfaces/      # 서비스 인터페이스 (DI용)
│   │   ├── repositories/    # DB 접근 (InMemory + PostgreSQL 구현)
│   │   ├── services/        # 비즈니스 로직 (인증, OAuth, 토큰, AI)
│   │   ├── routes/          # 라우트 핸들러 (팩토리 패턴)
│   │   ├── middleware/      # auth-required, error-handler
│   │   ├── errors/          # AppError, 에러 코드
│   │   └── utils/           # fetch-with-timeout 등
│   ├── migrations/          # PostgreSQL 마이그레이션 SQL
│   ├── .env                 # 환경변수 (커밋 제외)
│   └── package.json
├── frontend/            # 프론트엔드 (정적 파일, server가 서빙)
│   ├── index.html           # 메인 (로그인 후)
│   ├── landing.html         # 랜딩 (비로그인)
│   ├── login.html           # 로그인 페이지
│   ├── feed.html/js/css     # 펀드 목록 (피드)
│   ├── detail.html/js/css   # 펀드 상세
│   ├── fund-create.html/js/css  # 펀드 개설
│   ├── payment.html/js      # 결제
│   ├── profile.html/js      # 마이페이지
│   ├── settings.html/js     # 설정
│   ├── design-*.html        # AI 디자인 관련
│   ├── api.js               # 공용 fetch 래퍼 (window.api)
│   ├── app.js               # 홈 화면 로직
│   ├── mock-data.js         # 유틸 함수 (MOCK 데이터는 제거 예정)
│   ├── notification.js      # 알림
│   ├── search.js            # 검색
│   └── style.css            # 공용 스타일
├── docs/                # 문서
│   ├── work-status.md       # 작업 분담서 (상세 명세)
│   ├── ai-setup.md          # AI 서버 설정 가이드
│   └── github-guide.md      # Git 워크플로우 가이드
└── README.md
```

---

## 실행 방법

```bash
cd server
cp .env.example .env
# .env에 USE_INMEMORY=true, USE_MOCK_OAUTH=true 설정하면 DB/OAuth 없이 실행 가능
npm install
npm run dev
# → http://localhost:3000
```

단일 서버(localhost:3000)가 백엔드 API + 프론트엔드 정적 파일을 모두 서빙.

---

## 아키텍처 패턴

### Repository 패턴 (3종 세트)
새 엔티티 추가 시:
1. `types/<entity>.ts` — 인터페이스
2. `repositories/<entity>-repository.ts` — Repository 인터페이스 + InMemory 구현
3. `repositories/pg-<entity>-repository.ts` — PostgreSQL 구현

`app.ts`에서 `USE_INMEMORY` 환경변수로 InMemory/PG 분기.

### 라우트 핸들러 팩토리
각 엔드포인트는 팩토리 함수로 생성 (DI 주입):
```typescript
export function createSomeHandler(repo: SomeRepository) {
  return async (req: Request, res: Response) => { ... };
}
```

### 인증 흐름
- Google OAuth 2.0 → JWT access/refresh token → httpOnly 쿠키
- `@kookmin.ac.kr` 이메일만 허용
- Mock OAuth 모드로 로컬 개발 가능

---

## 주요 API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | /api/auth/me | ✓ | 내 정보 |
| POST | /api/auth/login | X | OAuth 로그인 시작 |
| POST | /api/auth/refresh | X | 토큰 갱신 |
| POST | /api/auth/logout | ✓ | 로그아웃 |
| GET | /api/funds | X | 펀드 목록 |
| GET | /api/funds/:id | X | 펀드 상세 |
| POST | /api/funds | ✓ | 펀드 개설 |
| POST | /api/ai/* | ✓ | AI 디자인/피팅 (미연결 시 503) |

---

## 현재 상태 및 진행 중인 작업

### 완료된 것
- Google OAuth 인증 (로그인/로그아웃/토큰 갱신)
- 프론트엔드 페이지 레이아웃 (landing, feed, detail, payment, profile 등)
- AI 라우트 구조 (ComfyUI/CatVTON 어댑터, 미연결 시 NullAi fallback)
- 펀드 개설 화면 (fund-create.html/js/css)

### 진행 중 / TODO
- 비즈니스 도메인 DB 마이그레이션 (product, fund, design 등 테이블)
- REST API 엔드포인트 구현 (B-5 작업)
- 프론트엔드 MOCK 데이터 → 실제 API 연동 전환
- 댓글 시스템
- 결제 PG 연동
- S3 파일 업로드
- 알림 시스템 서버 기반 전환

---

## 코딩 규칙

1. **하드코딩 금지** — 사용자/상품 데이터는 반드시 API에서 가져올 것
2. **XSS 방지** — 사용자 입력은 `textContent` 또는 `escapeHtml()` 사용
3. **새 라이브러리 도입 시 PR에 이유 명시**
4. **파일 명명**: kebab-case (예: `fund-create.ts`, `pg-user-repository.ts`)
5. **프론트엔드**: Vanilla JS, 전역 함수 패턴, 프레임워크 사용 금지
6. **백엔드**: TypeScript strict, ESM (`"type": "module"`)
7. **가격 계산은 항상 서버에서** — 클라이언트가 보낸 금액은 신뢰하지 않음

---

## 환경변수 (.env)

```
# 운영 필수
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DATABASE_URL=postgresql://...
ACCESS_TOKEN_SECRET=
REFRESH_TOKEN_SECRET=

# 로컬 개발
USE_INMEMORY=true          # DB 없이 메모리 저장소
USE_MOCK_OAUTH=true        # Google OAuth 우회
MOCK_LOGIN_EMAIL=test@kookmin.ac.kr
PORT=3000

# AI (미설정 시 503 응답)
AI_DESIGN_URL=
AI_TRYON_URL=
AI_TIMEOUT_MS=60000
```

---

## 참고 문서

- `docs/work-status.md` — 전체 작업 분담서 (상세 API 명세, DB 스키마, 비즈니스 규칙 포함)
- `docs/ai-setup.md` — AI 서버 설정 가이드
- `docs/github-guide.md` — Git 브랜치/PR 워크플로우
