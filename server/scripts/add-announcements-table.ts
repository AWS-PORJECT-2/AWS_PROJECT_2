import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getDbConnectionOptions } from './db-config.js';

/**
 * announcements 테이블 추가 마이그레이션.
 * - users 테이블의 id 를 author_id 로 참조 (FK)
 * - 작성자 삭제 시 author_id NULL 처리 (이력 유지)
 */

async function main() {
  const conn = await mysql.createConnection(getDbConnectionOptions());

  try {
    console.log('MySQL 연결 성공');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        author_id INT NULL COMMENT '작성자 (관리자) — 작성자 탈퇴 시 NULL',
        view_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_announcements_created_at (created_at),
        INDEX idx_announcements_author (author_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공지사항'
    `);
    console.log('✓ announcements 테이블');

    console.log('\n✅ 완료');
  } finally {
    await conn.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ 실패:', err); process.exit(1); });
