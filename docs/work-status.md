# 두띵(Doothing) 개발 작업 분담서

> **사용법**: 각 작업 항목을 그대로 ChatGPT/Claude/Cursor 등 AI에게 붙여넣어 개발 가능하도록 작성. 모든 파일 경로·기술·인터페이스가 명시되어 있음.

---

## 0. 공통 원칙 (모두 반드시 읽기)

### 0-1. 하드코딩 금지

**금지 패턴**

- 사용자 정보(이름·학과·포인트 등)를 JS 상수에 박아두기
- 상품 데이터를 클라이언트 배열에 박아두기 (예: `MOCK_PRODUCTS`)
- 절대 URL을 코드에 박아두기 (예: `'http://localhost:3000/api'`)
- 의미 없는 숫자 리터럴 (예: `if (rate >= 100)`)

**올바른 패턴**

- 사용자 정보 → `GET /api/auth/me` 응답
- 상품·펀드 정보 → `GET /api/funds`, `GET /api/products` 응답
- API base URL → `window.location.origin + '/api'` (동일 origin)
- 매직 넘버 → 상수 선언 후 사용 (예: `const FUND_GOAL_REACHED_RATE = 100;`)

### 0-2. 기술 스택 (이미 확정 — 임의 변경 금지)

| 영역 | 기술 | 버전 |
|---|---|---|
| 백엔드 언어 | TypeScript | 5.7+ |
| 백엔드 프레임워크 | Express | 4.21+ |
| 백엔드 런타임 | Node.js (tsx로 dev 실행) | 20+ |
| DB | PostgreSQL (AWS RDS) | 14+ |
| DB 클라이언트 | `pg` | 8.20+ |
| 인증 | JWT (`jsonwebtoken`) + httpOnly 쿠키 | — |
| 보안 미들웨어 | helmet, cors, express-rate-limit | — |
| 로깅 | pino | 10+ |
| 프론트엔드 | Vanilla HTML / CSS / JavaScript (모듈러 X, 전역 함수 패턴) | — |

새 라이브러리 도입은 PR 설명에 이유 명시.

### 0-3. 폴더·파일 명명 규칙

```
server/src/
├── types/                          # 한 파일당 한 엔티티 인터페이스
│   ├── user.ts
│   ├── product.ts                  ← 새로 추가 예시
│   └── index.ts                    # re-export
├── interfaces/                     # 서비스 인터페이스
├── repositories/                   # DB 접근 — 엔티티당 3종 세트
│   ├── product-repository.ts       # 인터페이스 + InMemory 구현
│   └── pg-product-repository.ts    # PostgreSQL 구현
├── services/                       # 비즈니스 로직
├── routes/                         # 한 엔드포인트당 한 파일 (핸들러 팩토리)
│   ├── products-list.ts            # GET /api/products
│   ├── products-detail.ts          # GET /api/products/:id
│   └── products.ts                 # 라우터 합본
├── middleware/
└── app.ts                          # createApp — DI 와이어링

server/migrations/
├── 001_create_tables.sql           # 이미 있음 (인증 4개 테이블)
├── 002_case_insensitive_unique.sql # 이미 있음
└── 003_create_business_tables.sql  ← 새로 추가 예시
```

### 0-4. Repository 패턴 — 반드시 따를 것

새 엔티티 추가 시 항상 **인터페이스 + InMemory 구현 + PostgreSQL 구현** 3종 세트.

기존 [server/src/repositories/user-repository.ts](../server/src/repositories/user-repository.ts), [pg-user-repository.ts](../server/src/repositories/pg-user-repository.ts) 를 그대로 패턴 복제.

### 0-5. 인증 미들웨어 (담당 B가 먼저 만들 공용 자산)

로그인된 사용자만 접근하는 API에 적용.

```typescript
// server/src/middleware/auth-required.ts
import type { Request, Response, NextFunction } from 'express';
import type { TokenService } from '../interfaces/token-service.js';

declare module 'express-serve-static-core' {
  interface Request { userId?: string; userEmail?: string; }
}

export function createAuthRequired(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.accessToken;
    if (!token) { res.status(401).json({ error: 'NOT_AUTHENTICATED' }); return; }
    const payload = tokenService.verifyAccessToken(token);
    if (!payload) { res.status(401).json({ error: 'INVALID_TOKEN' }); return; }
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  };
}
```

### 0-6. 검증 방법

작업 완료 후 반드시:

1. 타입체크 통과: `cd server && npx tsc --noEmit` → 에러 0개
2. PostgreSQL 모드 동작 확인: `USE_INMEMORY=false`, `DATABASE_URL` 채운 상태
3. 로컬 dev (DB 없이) 동작 확인: `USE_INMEMORY=true`
4. 새 API는 curl 또는 브라우저 DevTools로 200/401/404 등 분기 테스트

### 0-7. PR 단위 규칙

- 한 PR에 한 작업 항목만. (A-1과 A-2를 한 PR에 묶지 말 것)
- 새 라이브러리 추가 시 PR 설명에 이유 명시
- 하드코딩(MOCK_*) 잔존 코드 발견 시 리뷰에서 차단

---

## 1. 사장님(본인) 담당

펀드 개설 흐름과 AI 영역은 본인 작업. 디자인 화면(`design-upload.html`, `design-select.html`)도 AI 흐름과 직접 연결되므로 사장님 영역.

| # | 작업 | 파일 | 의존 |
|---|---|---|---|
| 1 | **펀드 개설 화면** | `fund-create.html` + `fund-create.js` 신규 | B의 `POST /api/funds` + `POST /api/designs` |
| 2 | **디자인 선택/업로드 화면 정식 구현** (현재 placeholder + alert만 있음) | `design-select.html`, `design-upload.html` 보강 + S3 또는 백엔드 업로드 호출 | B의 `POST /api/designs` |
| 3 | **AI 옷 디자인 생성** (Bedrock / Stable Diffusion / FLUX 검토) | `design-select.html` 의 "AI 디자인" 버튼 동작화, 별도 모듈 추가 | 외부 API 결정 후 |
| 4 | **AI 모델 피팅** (FASHN AI / Leffa / IDM-VTON) | 펀드 상세에 모델 피팅 이미지 노출 | GPU/비용 결정 후 |

다른 팀원은 이 영역을 건드리지 말 것.

**B에게 요청해 둘 것** (사장님 작업 시작 전 합의):
- `POST /api/designs` 응답 형식 → 사장님이 펀드 개설 시 `designId` 로 사용
- 이미지 업로드 방식 (multipart/form-data 또는 S3 presigned URL) — 둘 중 하나로 합의

---

## 2. 담당 B — 인증/백엔드/데이터 도메인 (로그인 만든 분)

> **B의 미션**: "프론트엔드가 안전하게 fetch 할 수 있는 백엔드 API와 DB를 만든다."
> 모든 mock 데이터(`MOCK_PRODUCTS`, `MOCK_USER`)를 제거할 수 있도록 서버 측 진실의 원천(Source of Truth)을 구축.

### B-1. 비즈니스 도메인 DB 마이그레이션 작성

**전제 — 절대 건드리지 말 것**:
- `migrations/001_create_tables.sql` (`user`, `allowed_domain`, `oauth_state`, `refresh_token`) 은 **이미 운영 RDS에 적용 완료**. 회원가입·로그인 기능 정상 동작 중
- `migrations/002_case_insensitive_unique.sql` 도 이미 적용 완료
- 따라서 003 마이그레이션은 **새 비즈니스 테이블만 추가**. 기존 `user` 테이블 컬럼 추가/수정 금지
- 회원 추가 정보(학과·학년·포인트)는 **별도의 `user_profile` 테이블로 분리** — 기존 `user` 테이블 스키마는 손대지 않음

**목표**: PostgreSQL에 `product`, `fund`, `fund_participation`, `fund_like`, `comment`, `design`, `payment`, `notification`, `address`, `user_profile` 테이블 생성.

**파일**: `server/migrations/003_create_business_tables.sql` (새로 생성)

**SQL 명세**:

```sql
-- SPA 기성품 카탈로그 (관리자가 등록)
CREATE TABLE product (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand        VARCHAR(100) NOT NULL,
  name         VARCHAR(255) NOT NULL,
  category     VARCHAR(50)  NOT NULL CHECK (category IN ('varsity','tshirt','hoodie','ecobag','keyring','sticker','etc')),
  base_price   INTEGER      NOT NULL CHECK (base_price >= 0),
  sizes        TEXT[]       NOT NULL DEFAULT '{}',
  colors       TEXT[]       NOT NULL DEFAULT '{}',
  size_type    VARCHAR(20)  NOT NULL DEFAULT 'multiple' CHECK (size_type IN ('multiple','free')),
  template_image_front TEXT,
  template_image_back  TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 사용자가 만든 디자인 (펀드의 베이스)
CREATE TABLE design (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES product(id),
  preview_image TEXT NOT NULL,                    -- S3 URL
  design_data   JSONB,                            -- 에디터 결과 JSON
  ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 펀드(공동구매)
CREATE TABLE fund (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  design_id        UUID NOT NULL REFERENCES design(id),
  product_id       UUID NOT NULL REFERENCES product(id),
  title            VARCHAR(255) NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  department       VARCHAR(100) NOT NULL,
  base_price       INTEGER NOT NULL,
  design_fee       INTEGER NOT NULL DEFAULT 0,
  platform_fee     INTEGER NOT NULL DEFAULT 2000,
  final_price      INTEGER NOT NULL,                  -- 자동 계산해서 저장
  target_quantity  INTEGER NOT NULL CHECK (target_quantity > 0),
  current_quantity INTEGER NOT NULL DEFAULT 0,
  deadline         DATE NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','achieved','failed','producing','completed','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fund_status_created ON fund(status, created_at DESC);
CREATE INDEX idx_fund_creator ON fund(creator_id);

-- 펀드 참여(예약)
CREATE TABLE fund_participation (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fund_id             UUID NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  size                VARCHAR(20) NOT NULL,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  payment_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (payment_status IN ('pending','paid','refunded','cancelled')),
  shipping_address_id UUID,                              -- address.id 참조
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fund_id, user_id)                              -- 한 사람당 한 펀드에 한 번만
);
CREATE INDEX idx_fp_user ON fund_participation(user_id);
CREATE INDEX idx_fp_fund ON fund_participation(fund_id);

-- 좋아요
CREATE TABLE fund_like (
  fund_id     UUID NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fund_id, user_id)
);

-- 댓글
CREATE TABLE comment (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fund_id     UUID NOT NULL REFERENCES fund(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES comment(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (LENGTH(content) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comment_fund_created ON comment(fund_id, created_at DESC);

-- 결제 기록
CREATE TABLE payment (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participation_id UUID NOT NULL REFERENCES fund_participation(id) ON DELETE RESTRICT,
  user_id          UUID NOT NULL REFERENCES "user"(id),
  amount           INTEGER NOT NULL,
  method           VARCHAR(20) NOT NULL CHECK (method IN ('tosspay','kakaopay','naverpay','card','bank')),
  status           VARCHAR(20) NOT NULL CHECK (status IN ('pending','paid','failed','refunded')),
  external_tx_id   VARCHAR(255),
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 알림
CREATE TABLE notification (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  fund_id     UUID REFERENCES fund(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notification_user_unread ON notification(user_id, created_at DESC) WHERE read_at IS NULL;

-- 배송지
CREATE TABLE address (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recipient   VARCHAR(50)  NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  zipcode     VARCHAR(10)  NOT NULL,
  address1    VARCHAR(255) NOT NULL,
  address2    VARCHAR(255),
  is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_address_user ON address(user_id);

-- 사용자 추가 정보 (기존 user 테이블은 손대지 않고 1:1 별도 테이블로 분리)
-- 회원가입 직후 자동 생성되지 않으므로, 조회 시 LEFT JOIN으로 NULL 허용 처리
CREATE TABLE user_profile (
  user_id     UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  department  VARCHAR(100),
  year        INTEGER CHECK (year BETWEEN 1 AND 6),
  points      INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FCM 푸시 토큰 (한 사용자가 여러 디바이스에 로그인할 수 있어 1:N)
CREATE TABLE push_token (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  device_label VARCHAR(100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);
CREATE INDEX idx_push_token_user ON push_token(user_id);
```

**검증**:
```bash
psql $DATABASE_URL -f server/migrations/003_create_business_tables.sql
psql $DATABASE_URL -c "\dt"  # 모든 테이블 보여야 함
```

---

### B-2. 마이그레이션 자동 적용 스크립트

**파일**: `server/scripts/migrate.ts` (새로 생성)

migrations 폴더의 `.sql` 파일을 순서대로 적용. 이미 적용된 것은 건너뜀.

**구현 골자**:
1. `_migration` 메타 테이블 생성 (`name TEXT PRIMARY KEY`)
2. `migrations/*.sql` 파일을 정렬해서 순회
3. 메타 테이블에 없는 것만 트랜잭션으로 적용 후 INSERT

**`server/package.json` scripts에 추가**:
```json
"migrate": "tsx scripts/migrate.ts"
```

**검증**: `cd server && npm run migrate` 두 번 연속 실행 시 두 번째는 모두 SKIP 출력.

---

### B-3. 인증 미들웨어 + DI 와이어링

**파일 생성**: `server/src/middleware/auth-required.ts` ([0-5 코드 그대로])

**파일 수정**: `server/src/app.ts`
- `req.userId` 가 필요한 라우트 앞에 `authRequired` 적용
- 새 Repository를 `USE_INMEMORY` 분기로 와이어링

```typescript
// app.ts 추가 예시
const authRequired = createAuthRequired(tokenService);

const productRepository = USE_INMEMORY
  ? new InMemoryProductRepository(getSeedProducts())
  : new PgProductRepository(pool);
const fundRepository = USE_INMEMORY ? new InMemoryFundRepository() : new PgFundRepository(pool);
// ...

app.use('/api/products', createProductsRouter(productRepository));        // 공개
app.use('/api/funds', createFundsRouter(...));                            // 일부만 인증
app.use('/api/me', authRequired, createMeRouter(...));                    // 전부 인증
```

**시드 데이터(InMemory 모드용)**: `server/src/seeds/products.ts` 에 SPA 기성품 5~6개 정의. **이건 InMemory 모드에서만 쓰는 시드이지 비즈니스 데이터 하드코딩이 아님.** PostgreSQL 모드에서는 운영자가 별도 등록.

---

### B-4. TypeScript 타입 + Repository (8개 엔티티)

각 엔티티마다 다음 4개:

1. `server/src/types/<entity>.ts` — 인터페이스
2. `server/src/repositories/<entity>-repository.ts` — Repository 인터페이스 + InMemory 구현
3. `server/src/repositories/pg-<entity>-repository.ts` — PostgreSQL 구현
4. `server/src/types/index.ts` — re-export 추가

**참고할 기존 코드**: [server/src/repositories/user-repository.ts](../server/src/repositories/user-repository.ts), [pg-user-repository.ts](../server/src/repositories/pg-user-repository.ts) 패턴 그대로 복제.

**작업 단위 (각각 독립적, 한 PR씩)**:

- B-4-a: `Product`
- B-4-b: `Design`
- B-4-c: `Fund` (참고: snake_case ↔ camelCase 매핑 신중히)
- B-4-d: `FundParticipation`
- B-4-e: `FundLike`
- B-4-f: `Comment`
- B-4-g: `Payment`
- B-4-h: `Notification`
- B-4-i: `Address`

**예시 — `Product`**:

```typescript
// server/src/types/product.ts
export type ProductCategory =
  'varsity'|'tshirt'|'hoodie'|'ecobag'|'keyring'|'sticker'|'etc';
export type SizeType = 'multiple' | 'free';

export interface Product {
  id: string;
  brand: string;
  name: string;
  category: ProductCategory;
  basePrice: number;
  sizes: string[];
  colors: string[];
  sizeType: SizeType;
  templateImageFront: string | null;
  templateImageBack: string | null;
  isActive: boolean;
  createdAt: Date;
}
```

```typescript
// server/src/repositories/product-repository.ts
import type { Product, ProductCategory } from '../types/index.js';

export interface ProductFilter {
  category?: ProductCategory;
  isActive?: boolean;
}

export interface ProductRepository {
  findAll(filter?: ProductFilter): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
}

export class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, Product>();
  constructor(initial?: Product[]) {
    if (initial) for (const p of initial) this.products.set(p.id, p);
  }
  async findAll(filter?: ProductFilter): Promise<Product[]> {
    return [...this.products.values()].filter(p => {
      if (filter?.category && p.category !== filter.category) return false;
      if (filter?.isActive !== undefined && p.isActive !== filter.isActive) return false;
      return true;
    });
  }
  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }
}
```

```typescript
// server/src/repositories/pg-product-repository.ts
import type { Pool } from 'pg';
import type { Product } from '../types/index.js';
import type { ProductRepository, ProductFilter } from './product-repository.js';

export class PgProductRepository implements ProductRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(filter?: ProductFilter): Promise<Product[]> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    if (filter?.category) { vals.push(filter.category); conds.push(`category = $${vals.length}`); }
    if (filter?.isActive !== undefined) { vals.push(filter.isActive); conds.push(`is_active = $${vals.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM product ${where} ORDER BY created_at DESC`, vals,
    );
    return rows.map(this.mapRow);
  }

  async findById(id: string): Promise<Product | null> {
    const { rows } = await this.pool.query(`SELECT * FROM product WHERE id = $1`, [id]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private mapRow = (row: Record<string, unknown>): Product => ({
    id: String(row.id),
    brand: String(row.brand),
    name: String(row.name),
    category: row.category as Product['category'],
    basePrice: Number(row.base_price),
    sizes: row.sizes as string[],
    colors: row.colors as string[],
    sizeType: row.size_type as Product['sizeType'],
    templateImageFront: row.template_image_front as string | null,
    templateImageBack: row.template_image_back as string | null,
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at as string),
  });
}
```

이 패턴을 8개 엔티티에 반복.

---

### B-5. REST API 엔드포인트 작성

기존 [server/src/routes/login.ts](../server/src/routes/login.ts), [me.ts](../server/src/routes/me.ts) 패턴(핸들러 팩토리 함수) 그대로 따라서 작성.

**필요한 엔드포인트 전부**:

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/products` | X | 상품 카탈로그 (쿼리: `category`) |
| GET | `/api/products/:id` | X | 상품 상세 |
| GET | `/api/funds` | X | 펀드 목록 (쿼리: `category`, `department`, `sort=popular\|latest`, `q`, `limit`, `offset`) |
| GET | `/api/funds/:id` | X | 펀드 상세 (product/design/creator JOIN 결과) |
| **POST** | **`/api/funds`** | ✓ | **펀드 개설 — 사장님이 호출** |
| POST | `/api/funds/:id/like` | ✓ | 좋아요 |
| DELETE | `/api/funds/:id/like` | ✓ | 좋아요 취소 |
| POST | `/api/funds/:id/participations` | ✓ | 참여 (size, quantity) |
| DELETE | `/api/funds/:id/participations` | ✓ | 참여 취소 |
| GET | `/api/funds/:id/comments` | X | 댓글 목록 |
| POST | `/api/funds/:id/comments` | ✓ | 댓글 작성 (content, parentId?) |
| DELETE | `/api/comments/:id` | ✓ | 본인 댓글만 삭제 |
| **POST** | **`/api/designs`** | ✓ | **디자인 등록 — 사장님이 펀드 개설 전에 호출.** body: multipart/form-data `{ productId, image(파일), aiGenerated? }` → `{ id, previewImage }` |
| GET | `/api/designs/:id` | ✓ | 디자인 단건 조회 (본인 또는 펀드에 사용된 것만) |
| DELETE | `/api/designs/:id` | ✓ | 본인 디자인만 삭제 |
| POST | `/api/payments/confirm` | ✓ | 결제 (participationId, method). 응답: `{ paymentId, status, amount }` |
| GET | `/api/me/participations` | ✓ | 내 참여 목록 |
| GET | `/api/me/funds` | ✓ | 내가 만든 펀드 |
| GET | `/api/me/likes` | ✓ | 내가 좋아요한 펀드 |
| GET | `/api/me/stats` | ✓ | `{ paymentPending, paymentDone, shippingReady, shippingDone }` |
| GET | `/api/me/addresses` | ✓ | 내 배송지 목록 |
| POST | `/api/me/addresses` | ✓ | 배송지 추가 |
| PATCH | `/api/me/addresses/:id` | ✓ | 배송지 수정 |
| DELETE | `/api/me/addresses/:id` | ✓ | 배송지 삭제 |
| GET | `/api/notifications` | ✓ | 내 알림 목록 |
| POST | `/api/notifications/:id/read` | ✓ | 알림 읽음 처리 |
| POST | `/api/me/push-tokens` | ✓ | FCM 토큰 등록 (body: `{ token, deviceLabel? }`) |
| DELETE | `/api/me/push-tokens` | ✓ | FCM 토큰 해제 (body: `{ token }`) |

**`POST /api/designs` 구현 메모**:
- 파일 업로드 라이브러리: `multer` 사용 (multipart/form-data)
- 저장 경로: 1차 — `server/uploads/` 디렉토리에 저장 + `previewImage` 필드에 `/uploads/<file>` 상대 경로
- 2차 — S3 도입 시점에 presigned URL 또는 서버 → S3 업로드로 전환
- 라우트 등록 예시: `app.use('/uploads', express.static('uploads'))`
- 검증: 파일 크기 제한 10MB, MIME 화이트리스트(`image/png`, `image/jpeg`, `image/webp`)

**중요한 비즈니스 규칙**:

- **`POST /api/funds/:id/participations`** 응답의 `finalPrice` 는 서버에서 `base_price + design_fee + platform_fee` 로 계산. **클라이언트가 보낸 가격은 절대 신뢰하지 않음.**
- `current_quantity` 는 참여 시 +`quantity`, 취소 시 -`quantity`. **반드시 트랜잭션** (`BEGIN/COMMIT`).
- `target_quantity` 도달 시 자동 전이: `status = 'achieved'` + 모든 참여자에게 `notification` INSERT.
- **`POST /api/payments/confirm`** 의 `amount`는 서버가 `participation.quantity × fund.final_price` 로 다시 계산. 클라이언트가 보낸 amount는 무시.

**검증**:
```bash
# 401 분기
curl -i http://localhost:3000/api/funds/<some-id>/like -X POST  # 401

# 200 분기 (쿠키 있는 상태)
curl -i -b cookies.txt http://localhost:3000/api/funds/<id>/like -X POST  # 200
```

---

### B-6. `/api/auth/me` 응답 확장

**파일 수정**: `server/src/routes/me.ts`

현재 `{ userId, email }` 만 반환. `user` 테이블의 `name`, `picture`, `createdAt` + `user_profile` 테이블의 `department`, `year`, `points` 까지 포함.

**중요**: 기존 `user` 테이블 스키마는 절대 변경하지 않음. `user_profile` 은 회원가입 직후 자동 생성되지 않으므로 **LEFT JOIN** 으로 처리하고, 없을 때는 `null` 반환.

```typescript
const { rows } = await pool.query(
  `SELECT u.id, u.email, u.name, u.picture, u.created_at,
          p.department, p.year, p.points
     FROM "user" u
     LEFT JOIN user_profile p ON p.user_id = u.id
    WHERE u.id = $1`,
  [payload.userId],
);
if (!rows[0]) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
const r = rows[0];
res.json({
  id: r.id, email: r.email, name: r.name, picture: r.picture,
  department: r.department,                    // null 가능
  year: r.year,                                // null 가능
  points: r.points ?? 0,
  createdAt: r.created_at,
});
```

**프로필 정보 입력 API (선택, 시간 남으면)**:
- `PATCH /api/me/profile` body: `{ department?, year? }` → user_profile UPSERT
- 마이페이지에서 학과/학년 입력받는 화면이 추가될 때 함께 구현

> 회원가입 흐름 자체(`auth-service.ts`)는 절대 손대지 말 것 — 이미 운영 중.

---

### B-7. 결제 백엔드 로직

**파일**: `server/src/routes/payments-confirm.ts` (현재 `app.ts`의 인라인 mock은 이미 제거됨 → 새로 정식 구현)

**로직**:
1. `participationId` 가 `req.userId` 의 것인지 확인
2. `fund.final_price × participation.quantity` 로 `amount` 계산 (클라이언트 입력 무시)
3. `payment` INSERT (`status = 'paid'` 또는 `'pending'`)
4. `fund_participation.payment_status` 업데이트
5. `payment` 객체 반환

**라우트 등록**: `app.use('/api/payments', authRequired, createPaymentsRouter(...))`

실제 PG SDK(토스페이먼츠 등) 연동은 **TODO 주석**으로 남기고 mock 처리. PG 견적 결정 후 별도 작업.

---

### B-8. 검색 API 통합

**경로**: `GET /api/funds?q=과잠`

B-5의 펀드 목록 API에 `q` 파라미터 처리 추가:

```sql
WHERE status IN ('open','achieved')
  AND ($1::text IS NULL OR title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%' OR department ILIKE '%' || $1 || '%')
```

> 현재 `frontend/search.js` 가 백엔드 호출 후 실패 시 클라이언트 substring fallback. 백엔드가 `?q=` 처리하면 자동으로 정상 동작.

---

## 3. 담당 A — 프론트엔드/게시판/UI 도메인 (게시판 만든 분)

> **A의 미션**: "모든 mock 데이터를 실제 서버 API 호출로 바꾸고, 누락된 화면을 채운다."
> B의 백엔드 작업에 의존하지만, A-1·A-2(공용 헬퍼)는 즉시 시작 가능.

### A-1. 공용 API 클라이언트 헬퍼

**파일**: `frontend/api.js` (새로 생성)

**목표**: 모든 페이지에서 동일한 fetch 래퍼 사용.

```javascript
// frontend/api.js
(function () {
  const API_BASE = window.location.origin + '/api';

  async function request(path, options) {
    options = options || {};
    const init = {
      credentials: 'include',
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
      method: options.method || 'GET',
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);

    const res = await fetch(API_BASE + path, init);

    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('NOT_AUTHENTICATED');
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error((data && data.message) || res.statusText);
      err.code = data && data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  window.api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: body }),
    patch: (path, body) => request(path, { method: 'PATCH', body: body }),
    del: (path) => request(path, { method: 'DELETE' }),
  };
})();
```

**모든 HTML에 `<script src="api.js"></script>` 를 다른 스크립트보다 먼저 로드**.

---

### A-2. XSS 안전 DOM 헬퍼

**파일**: `frontend/dom.js` (새로 생성)

**목표**: 사용자 입력을 화면에 표시할 때 안전하게 escape.

```javascript
// frontend/dom.js
(function () {
  // 텍스트 → HTML-escape된 문자열 (속성·텍스트 모두 안전)
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // DOM API로 카드 렌더링하는 헬퍼 패턴 (권장)
  function createCard(item) {
    const a = document.createElement('a');
    a.href = '/detail.html?id=' + encodeURIComponent(item.id);
    a.className = 'funding-card';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title;
    a.appendChild(title);

    const price = document.createElement('div');
    price.className = 'card-price';
    price.textContent = item.priceText;
    a.appendChild(price);

    return a;
  }

  window.dom = { escapeHtml: escapeHtml, createCard: createCard };
})();
```

**규칙**: 사용자 입력(제목·설명·작가명·학과명·댓글 본문 등)은 **반드시 `textContent` 또는 `escapeHtml`** 거쳐 화면에 출력. 템플릿 리터럴로 직접 합치는 코드는 모두 교체.

---

### A-3. `MOCK_USER` 제거 + `/api/auth/me` 연동

**대상**: `frontend/profile.js`, `frontend/index.html`(헤더 프로필 이미지)

**작업**:

1. `profile.js` 에서 `MOCK_USER`, `MOCK_ORDER_STATUS` 상수 **완전 삭제**
2. 진입점에서 fetch:

```javascript
async function loadProfile() {
  const me = await api.get('/auth/me');     // { id, email, name, picture, department, year, points, createdAt }
  const stats = await api.get('/me/stats'); // { paymentPending, paymentDone, ... }
  renderProfile(me, stats);
}
```

3. `renderProfile` 시그니처를 `(me, stats)` 로 변경하고 `MOCK_USER.*` 참조를 모두 `me.*` 로 교체
4. 사용자 프로필 이미지·이름은 `textContent` 로만 출력 (XSS 방지)

**`user_profile` 미입력 사용자 처리**:
- 회원가입 직후 사용자는 `user_profile` 레코드가 없으므로 `me.department`, `me.year` 가 `null` 일 수 있음
- 화면에 `null` 그대로 노출하지 말고 fallback 처리:
  ```javascript
  const department = me.department || '학과 미입력';
  const year = me.year ? me.year + '학년' : '';
  const levelLabel = me.points >= 1000 ? '굿즈 크리에이터' : '새내기';   // 포인트 기반 레벨 계산
  ```
- 학과·학년이 `null` 인 경우 마이페이지 상단에 "프로필 완성하기" 안내 띄우기 (`PATCH /api/me/profile` 호출 화면. A-6의 선택 작업과 함께)

**의존**: B-6(me API 확장).

---

### A-4. `MOCK_PRODUCTS` 제거 — 페이지별 API 연동

**대상**: `feed.js`, `app.js`, `detail.js`, `payment.js`, `notification.js`, `search.js`, `profile.js`

**작업**:
- `mock-data.js` 의 `MOCK_PRODUCTS` 배열 **완전 삭제** (파일은 유지하되 유틸 함수만 남김)
- `calcAchievementRate`, `sortByLikes` 등 유틸은 유지
- 좋아요·예약 상태도 localStorage 기반에서 서버 기반으로 변경

**페이지별 변환표**:

| 페이지 | 기존 | 변환 후 |
|---|---|---|
| `app.js` (홈) | `sortByLikes(MOCK_PRODUCTS).slice(0,n)` | `await api.get('/funds?sort=popular&limit=6')` |
| `feed.js` | `MOCK_PRODUCTS` 클라이언트 필터 | `await api.get('/funds?category=...&department=...&sort=...')` |
| `detail.js` | `MOCK_PRODUCTS.find(p => p.id === id)` | `await api.get('/funds/' + encodeURIComponent(id))`. 좋아요·참여 상태도 응답에 포함된 값 사용 |
| `payment.js` | `MOCK_PRODUCTS` + URL 파라미터 | (1) `await api.get('/funds/' + id)` 로 가격·옵션 조회 (2) **참여 시 `POST /api/funds/:id/participations` 응답의 `participationId` 보관** (3) 결제 시 `api.post('/payments/confirm', { participationId, method })`. 응답 형식이 `{ paymentId, status, amount }` 로 변경되었으므로 결제 완료/대기 분기를 `status === 'paid' \| 'pending'` 기반으로 다시 작성 |
| `notification.js` | `MOCK_PRODUCTS.filter(p => p.isReserved)` | `await api.get('/notifications')` |
| `search.js` | 클라이언트 substring | `await api.get('/funds?q=' + encodeURIComponent(keyword))` |
| `profile.js` | `MOCK_PRODUCTS.filter(...)` | `await api.get('/me/likes' \| '/me/participations' \| '/me/funds')` |

**localStorage 정리**:
- 결제 상태(`paid_${id}`, `pending_${id}`) → 모두 삭제. 서버에서 받음.
- 사이즈 임시 저장(`selectedSize_${id}`) → 페이지 내 변수만 유지
- `liked_delta_*`, `reserved_delta_*` → 모두 삭제. 좋아요/참여 수치는 서버 응답에 포함

**의존**: B-4·B-5 모두 완료된 후.

---

### A-5. 댓글 UI + 백엔드 연동

**파일**:
- `detail.html` 하단에 댓글 섹션 추가
- `frontend/comments.js` 신규
- `frontend/comments.css` 신규

**기능**:
- `GET /api/funds/:id/comments` 로 목록 로드
- 입력창 + 등록 버튼 → `POST /api/funds/:id/comments`
- 본인 댓글에만 삭제 버튼 노출 → `DELETE /api/comments/:id`
- 대댓글(`parentId`) 1단계까지 펼치기/접기

**스타일 규칙**: 기존 `style.css` 의 색상 토큰 (#2563eb, #6b7280 등) 재사용. 새 클래스명은 `comment-` prefix.

**XSS 주의**: 댓글 본문은 사용자 입력 → `textContent` 로만 출력.

---

### A-6. 마이페이지 통계·수익 화면

**파일**: `profile.html` 하단 "배송/결제 현황" 섹션 + `frontend/revenue.html` (신규) + `frontend/revenue.js` (신규)

**작업**:
1. `profile.js` 의 `MOCK_ORDER_STATUS` 삭제 → `await api.get('/me/stats')` 결과 사용
2. 수익 내역 페이지 신설:
   - `GET /api/me/funds` 로 본인 개설 펀드 목록
   - 각 펀드별 참여자 수 × 디자인 수수료 = 예상 수익
   - 정산 완료 (`status='completed'`) 펀드와 진행중 (`status='open'`, `'achieved'`, `'producing'`) 분리

---

### A-7. 배송지 관리 페이지

**대상**: `frontend/address-manage.html` (현재 placeholder), `frontend/address-manage.js` (신규)

**기능**:
- `GET /api/me/addresses` 로 목록
- 추가 폼: 받는 사람, 전화번호, 우편번호, 주소1, 주소2, 기본 배송지 토글
- 우편번호 검색 — Daum 우편번호 서비스 사용
- 수정·삭제 버튼

**Daum 우편번호 통합**:

```html
<script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
```

```javascript
function openPostcode() {
  new daum.Postcode({
    oncomplete: function (data) {
      document.getElementById('zipcode').value = data.zonecode;
      document.getElementById('address1').value = data.address;
    }
  }).open();
}
```

**의존**: B-5의 `/api/me/addresses/*`.

---

### A-8. 결제 수단 관리 페이지 (범위 제한)

**대상**: `frontend/payment-manage.html` (placeholder)

**범위**: 현재는 결제 PG 미연동. 이 페이지는 표시·안내용으로만 작성.
- "현재 등록된 카드/계좌 없음" 영구 표시
- 추후 PG 연동 시점에 카드 토큰 표시 영역 추가하기 쉬운 구조로 마크업

---

### A-9. 알림 시스템 서버 기반 전환

**대상**: `frontend/notification.js`

**변경**:
- `MOCK_PRODUCTS.filter(p => p.isReserved)` 로직 삭제
- `await api.get('/notifications')` 로 서버 알림 가져옴
- 각 알림 클릭 시 `POST /api/notifications/:id/read` 호출 후 해당 페이지 이동
- 읽지 않은 알림 수를 사이드바·헤더 종 아이콘에 배지로 표시

**의존**: B-5의 `/api/notifications/*`.

---

### A-10. 푸시 알림 (FCM) 클라이언트 통합

**범위**:
1. Firebase 프로젝트 생성 + Web Push 설정 (Firebase 공식 가이드 참고)
2. `frontend/push.js` (신규)
   - 권한 요청 (`Notification.requestPermission()`)
   - FCM 토큰 발급
   - `await api.post('/me/push-tokens', { token, deviceLabel: navigator.userAgent.slice(0, 50) })` 로 서버에 토큰 저장
   - 로그아웃 시 `api.del('/me/push-tokens')` 로 토큰 해제
3. 서비스 워커 등록 (`firebase-messaging-sw.js` — Firebase 공식 가이드 그대로)

**의존**: B-1의 `push_token` 테이블 + B-5의 `POST /api/me/push-tokens` / `DELETE /api/me/push-tokens` 엔드포인트.

이번 분담에서는 **클라이언트 토큰 발급·저장까지만**. 서버 → FCM 메시지 발송 로직은 별도 PR로 추후 진행.

---

### A-11. UX 정리 — `alert/confirm` → 토스트

**파일**: `frontend/toast.js` (신규)

```javascript
// frontend/toast.js
(function () {
  let container;
  function ensure() {
    if (container) return container;
    container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:24px;left:50%;transform:translateX(-50%);' +
      'z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
    return container;
  }
  function show(message, type) {
    const colors = { info: '#2563eb', success: '#16a34a', error: '#ef4444' };
    const el = document.createElement('div');
    el.style.cssText =
      'padding:12px 20px;border-radius:10px;color:#fff;font-size:14px;' +
      'font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
      'background:' + (colors[type] || colors.info);
    el.textContent = message;
    ensure().appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  window.toast = {
    info: (m) => show(m, 'info'),
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
  };
})();
```

**작업**:
```bash
grep -rn "alert(" frontend/*.js frontend/*.html
```
검색해서 19곳 정도를 적절히 `toast.success` / `toast.info` / `toast.error` 로 교체.

`confirm()` 은 일단 유지 (모달 컴포넌트는 추후).

---

### A-12. 인라인 스타일 정리 (선택, 시간 남으면)

각 페이지의 긴 `style="..."` 를 `style.css` 또는 페이지별 CSS 파일의 클래스로 이동. 우선순위 낮음.

---

## 4. 작업 순서

> **A** = 게시판 만든 분 (프론트 도메인) / **B** = 로그인 만든 분 (백엔드 도메인) / **사장님** = 펀드 개설 + AI

### 1주차

- **B**: B-1(마이그레이션) → B-2(migrate 스크립트) → B-3(미들웨어/DI) → B-4 일부(`Product`, `Fund`, `FundParticipation`)
- **A**: A-1(api.js) → A-2(dom.js) → A-11(toast.js) — 즉시 시작 가능
- **사장님**: 대기 (B-5의 `POST /api/funds` + `POST /api/designs` 가 끝나야 시작)

### 2주차

- **B**: B-4 나머지 → B-5(API 엔드포인트 전부) → B-6(me 확장) → B-7(결제) → B-8(검색)
- **A**: A-3(`MOCK_USER` 제거) → A-4(`MOCK_PRODUCTS` 제거 — 페이지별 순차) → A-5(댓글)
- **사장님**: 펀드 개설 화면 시작

### 3주차

- **B**: 버그 수정 + 인덱스 최적화 + `POST /api/me/push-tokens` 마무리
- **A**: A-6(마이페이지 통계) → A-7(배송지) → A-8(결제수단 표시) → A-9(알림 서버화) → A-10(FCM 클라이언트)
- **사장님**: AI 디자인 생성 시작

### 4주차

- 통합 테스트, 시연 준비

---

## 5. 의존성

```
B-1 마이그레이션
 └→ B-2 migrate 스크립트
     └→ B-3 DI 와이어링
         └→ B-4 타입·Repository
             └→ B-5 API 엔드포인트
                 ├→ 사장님: 펀드 개설 (POST /api/funds + POST /api/designs)
                 ├→ A-4 MOCK_PRODUCTS 제거 (모든 페이지 fetch 전환)
                 ├→ A-5 댓글
                 ├→ A-6 마이페이지 통계
                 ├→ A-7 배송지
                 ├→ A-9 알림 서버화
                 └→ A-10 FCM 클라이언트 (POST /api/me/push-tokens 의존)

B-6 me 확장 → A-3 MOCK_USER 제거

A-1 api.js ← 모든 A 작업 + 사장님 작업 전제 (페이지 → 서버 호출 표준)
A-2 dom.js ← A-4·A-5 등 화면 렌더링 전제
```

**충돌 가능 영역 (사전 합의)**:
- `frontend/payment.js` — A-4에서 응답 형식을 새 결제 API에 맞게 갈아엎음. B-7 결제 API 머지 후 A-4 진행해야 충돌 없음
- `frontend/notification.js` — A-4에서 `MOCK_PRODUCTS` 제거 + A-9에서 알림 서버화. 두 작업이 같은 파일을 만지므로 한 사람이 묶어서 진행하거나 PR 순서 합의
- `server/src/app.ts` — B-3에서 미들웨어/Repository DI 추가, B-5에서 라우트 추가. 같은 파일을 자주 수정하므로 PR 머지 시 rebase 빈번. 작업 단위마다 즉시 머지 권장

---

## 6. AI에게 작업 시킬 때 권장 프롬프트

이 문서를 통째로 AI에게 첨부하면서 다음 형식으로 요청:

```
이 문서의 [B-4-a Product 엔티티] 작업을 진행해줘.

대상 파일:
- server/src/types/product.ts (신규)
- server/src/repositories/product-repository.ts (신규)
- server/src/repositories/pg-product-repository.ts (신규)
- server/src/types/index.ts (re-export 추가)

기존 user-repository.ts / pg-user-repository.ts 패턴을 그대로 따라야 해.
0번 공통 원칙(특히 0-1 하드코딩 금지, 0-4 Repository 패턴) 준수.
완료 후 npx tsc --noEmit 통과해야 함.
```

작업 단위가 명확하므로 AI가 헷갈리지 않게 가이드 가능.

---

## 7. 합의 사항

- PR은 작업 단위(B-1, B-2, A-1...)로 분리. 한 PR에 여러 작업 묶지 말 것
- 머지 전 두 모드에서 동작 확인:
  - `USE_INMEMORY=true` (DB 없이)
  - `USE_INMEMORY=false` + 실제 RDS
- 타입 에러 0개: `cd server && npx tsc --noEmit`
- 새 라이브러리 도입 시 PR 설명에 이유 명시
- 하드코딩(`MOCK_*`, 절대 URL, 매직 넘버) 발견 시 리뷰 차단
