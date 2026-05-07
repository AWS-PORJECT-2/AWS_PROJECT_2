# 🎓 국민대학교 공동구매 · 중고거래 통합 플랫폼

국민대학교 학생 전용 공동구매 및 중고거래 웹 플랫폼입니다.

## 주요 기능

- **공동구매**: 과잠, 후드티, 키링 등 공동구매 개설/참여/관리
- **AI 디자인**: 디자인 생성·모델 피팅 미리보기 (예정)
- **학교 인증**: Google Workspace 기반 @kookmin.ac.kr 이메일 로그인

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | HTML / CSS / Vanilla JS (모바일·PC 반응형) |
| 백엔드 | Node.js, Express, TypeScript |
| 데이터베이스 | PostgreSQL (AWS RDS) |
| 인증 | Google OAuth 2.0 + JWT (httpOnly 쿠키) |
| 파일 저장 | Amazon S3 (예정) |

## 프로젝트 구조

```
├── server/         # 백엔드 (Express + TS) — frontend/ 정적 서빙도 함께 담당
│   ├── src/
│   ├── migrations/ # PostgreSQL 마이그레이션
│   └── .env        # 환경변수 (커밋 제외)
├── frontend/       # 프론트엔드 (HTML/CSS/JS, 페이지별 분리)
└── README.md
```

단일 서버(localhost:3000) 하나로 백엔드 API와 모든 프론트 페이지를 함께 제공합니다.

## 시작하기

```bash
# 1. 레포 클론
git clone https://github.com/AWS-PORJECT-2/AWS_PROJECT_2.git
cd AWS_PROJECT_2

# 2. 환경변수 설정
cd server
cp .env.example .env
# 운영 시: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ACCESS_TOKEN_SECRET,
#         REFRESH_TOKEN_SECRET, DATABASE_URL 입력
# 로컬 테스트: USE_INMEMORY=true, USE_MOCK_OAUTH=true 로 OAuth/DB 없이 실행 가능

# 3. 의존성 설치 + 실행
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## 로컬 dev 모드

OAuth 키나 RDS 비밀번호 없이도 인증 흐름을 시연할 수 있습니다.

`server/.env` 에 다음을 설정:

```
USE_INMEMORY=true       # PostgreSQL 없이 메모리 저장소 사용
USE_MOCK_OAUTH=true     # Google 호출 우회, 가짜 사용자로 즉시 로그인
MOCK_LOGIN_EMAIL=test@kookmin.ac.kr
```

두 옵션 모두 `NODE_ENV=production` 에서는 자동으로 무시됩니다.

## 팀원

- 국민대학교 이로운(팀장)
- 국민대학교 이상진
- 국민대학교 조영건
