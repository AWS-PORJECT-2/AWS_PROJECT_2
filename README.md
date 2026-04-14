# 🎓 국민대학교 공동구매 · 중고거래 통합 플랫폼

국민대학교 학생 전용 공동구매 및 중고거래 웹 플랫폼입니다.

## 주요 기능

- **공동구매**: 과잠, 후리스, 버스 대절 등 공동구매 개설/참여/관리
- **AI 글 생성**: 공동구매 게시글 제목/설명 자동 생성
- **학교 인증**: @kookmin.ac.kr 메일 인증으로 재학생만 이용

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React, TypeScript, Tailwind CSS |
| 백엔드 | AWS Lambda (Node.js), API Gateway |
| 데이터베이스 | Amazon DynamoDB |
| 인증 | Amazon Cognito |
| 파일 저장 | Amazon S3 + CloudFront |
| AI | Amazon Bedrock (Nova Micro) |

## 시작하기

```bash
# 1. 레포 클론
git clone https://github.com/AWS-PORJECT-2/AWS_PROJECT_2.git
cd AWS_PROJECT_2

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 실제 값 입력

# 3. 프론트엔드
cd frontend
npm install
npm run dev

# 4. 백엔드
cd backend
npm install
```

## 프로젝트 구조

```
├── frontend/          # 프론트엔드 (React)
├── backend/           # 백엔드 (Lambda 함수)
│   └── template.yaml  # SAM 템플릿
├── .github/           # GitHub Actions, PR/이슈 템플릿
├── .env.example       # 환경변수 예시
└── README.md
```

## 팀원
국민대학교 이로운(팀장)
국민대학교 이상진
국민대학교 조영건
