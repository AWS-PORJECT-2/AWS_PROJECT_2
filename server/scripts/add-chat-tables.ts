import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

/**
 * chat_rooms / chat_messages 테이블 추가.
 * - 1대1 상담: 유저별 1개의 chat_room (UNIQUE user_id)
 * - sender_id: 유저(USER) 또는 관리자(ADMIN) FK
 * - is_read: 관리자가 읽었는지 (유저 → 관리자 메시지 기준)
 */

async function main() {
  const sslConfig = fs.existsSync('./global-bundle.pem')
    ? { ca: fs.readFileSync('./global-bundle.pem', 'utf8'), rejectUnauthorized: true }
    : undefined;

  const conn = await mysql.createConnection({
    host: 'doothing-db.cj24wem202yj.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'fkdldjs22',
    port: 3306,
    database: 'doothing',
    ssl: sslConfig,
  });

  try {
    console.log('MySQL 연결 성공');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE COMMENT '문의한 유저 (1유저당 1방)',
        last_message TEXT NULL COMMENT '마지막 메시지 미리보기',
        last_message_at DATETIME NULL,
        unread_admin_count INT NOT NULL DEFAULT 0 COMMENT '관리자가 안 읽은 유저 메시지 수',
        unread_user_count INT NOT NULL DEFAULT 0 COMMENT '유저가 안 읽은 관리자 메시지 수',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_rooms_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='채팅방'
    `);
    console.log('✓ chat_rooms');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        sender_id INT NOT NULL COMMENT '보낸 사람 user_id',
        sender_role ENUM('USER', 'ADMIN') NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_messages_room_created (room_id, created_at),
        INDEX idx_chat_messages_unread (room_id, is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='채팅 메시지'
    `);
    console.log('✓ chat_messages');

    console.log('\n✅ 완료');
  } finally {
    await conn.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌', err); process.exit(1); });
