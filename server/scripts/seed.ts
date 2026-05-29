/**
 * 시드 데이터 스크립트 — RDS에 샘플 상품(공동구매) 데이터를 INSERT.
 * 실행: npm run db:seed
 *
 * idempotent — 이미 데이터가 있으면 스킵.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

interface SeedProduct {
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  author: string;
  authorEmail: string;
  schoolDomain: string;
  finalPrice: number;
  basePrice: number;
  targetQuantity: number;
  currentQuantity: number;
  daysLeft: number;
}

const JACKET_DIR = '/' + encodeURIComponent('과잠 이미지') + '/';
const J = (name: string) => JACKET_DIR + encodeURIComponent(name);

const PRODUCTS: SeedProduct[] = [
  {
    title: '국민대학교 실시간 인기 순위 과잠',
    description: '2026년 신규 디자인 국민대학교 과잠입니다. 고급 울 소재에 자수 로고가 들어간 프리미엄 에디션이에요.',
    category: '과잠',
    imageUrl: J('다운로드.jpg'),
    author: '김민수',
    authorEmail: 'minsoo.kim@kookmin.ac.kr',
    schoolDomain: 'kookmin.ac.kr',
    finalPrice: 89000,
    basePrice: 89000,
    targetQuantity: 50,
    currentQuantity: 60,
    daysLeft: 14,
  },
  {
    title: '국민대학교 블랙 반팔티 공구',
    description: '깔끔한 블랙 반팔티에 국민대 로고가 미니멀하게 들어간 디자인입니다. 면 100% 소재.',
    category: '반팔티',
    imageUrl: J('다운로드 (1).jpg'),
    author: '이서연',
    authorEmail: 'seoyeon.lee@kookmin.ac.kr',
    schoolDomain: 'kookmin.ac.kr',
    finalPrice: 19000,
    basePrice: 19000,
    targetQuantity: 30,
    currentQuantity: 24,
    daysLeft: 19,
  },
  {
    title: '[앵콜] 국민대학교 과잠 디자인 에디션',
    description: '지난 시즌 완판된 디자인 에디션 과잠의 앵콜 공구입니다. 한정판 자수 퀄리티.',
    category: '과잠',
    imageUrl: J('다운로드 (2).jpg'),
    author: '박지훈',
    authorEmail: 'jihoon.park@kookmin.ac.kr',
    schoolDomain: 'kookmin.ac.kr',
    finalPrice: 95000,
    basePrice: 95000,
    targetQuantity: 40,
    currentQuantity: 80,
    daysLeft: 9,
  },
  {
    title: '국민대학교 미니멀 에코백',
    description: '데일리로 메기 좋은 미니멀 에코백입니다. 두꺼운 캔버스 원단으로 튼튼해요.',
    category: '에코백',
    imageUrl: J('다운로드 (3).jpg'),
    author: '최유진',
    authorEmail: 'yujin.choi@kookmin.ac.kr',
    schoolDomain: 'kookmin.ac.kr',
    finalPrice: 12000,
    basePrice: 12000,
    targetQuantity: 60,
    currentQuantity: 27,
    daysLeft: 24,
  },
];

async function seed() {
  console.log('🌱 시드 데이터 적용 시작...');

  // 1) 기존 데이터 확인
  const existing = await pool.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM groupbuys');
  if (Number(existing.rows[0].cnt) > 0) {
    console.log(`✓ 이미 ${existing.rows[0].cnt}개의 공동구매가 존재 — 스킵`);
    await pool.end();
    return;
  }

  // 2) 사용자 upsert
  const userIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    if (userIds.has(p.authorEmail)) continue;

    const found = await pool.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1',
      [p.authorEmail.toLowerCase()],
    );
    let id: string;
    if (found.rows.length > 0) {
      id = found.rows[0].id;
    } else {
      id = randomUUID();
      await pool.query(
        `INSERT INTO "user" (id, email, name, school_domain, role, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, 'USER', NOW(), NOW())`,
        [id, p.authorEmail.toLowerCase(), p.author, p.schoolDomain],
      );
    }
    userIds.set(p.authorEmail, id);
  }

  // 3) 공동구매 INSERT
  for (const p of PRODUCTS) {
    const creatorId = userIds.get(p.authorEmail)!;
    const id = randomUUID();
    const deadline = new Date(Date.now() + p.daysLeft * 24 * 60 * 60 * 1000);
    const productOptions = {
      category: p.category,
      imageUrl: p.imageUrl,
    };

    await pool.query(
      `INSERT INTO groupbuys (
        id, creator_id, title, description, product_options,
        base_price, design_fee, platform_fee, final_price,
        target_quantity, current_quantity, deadline, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 0, 0, $7, $8, $9, $10, 'open', NOW(), NOW())`,
      [
        id, creatorId, p.title, p.description, JSON.stringify(productOptions),
        p.basePrice, p.finalPrice,
        p.targetQuantity, p.currentQuantity, deadline,
      ],
    );
    console.log(`  ✓ ${p.title}`);
  }

  console.log('✅ 시드 완료.');
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ 시드 실패:', err);
  process.exit(1);
});
