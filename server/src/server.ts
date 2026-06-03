import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initSocketIO } from './socket.js';
import { TokenServiceImpl } from './services/token-service.js';
import { PgUserRepository } from './repositories/pg-user-repository.js';
import { pool } from './db.js';
import { logger } from './logger.js';

// 전역 안전망 — 비요청 경로(스케줄러·소켓 등)의 처리 안 된 거부/예외가 프로세스를 죽이지 않도록 로깅만 하고 유지.
// (Node 15+ 는 unhandledRejection 시 기본 종료. DB 일시 단절 등으로 전체 API 가 내려가는 것을 막는 가용성 방어.)
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '처리되지 않은 Promise 거부 — 프로세스 유지');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, '처리되지 않은 예외 — 프로세스 유지');
});

const rawPort = process.env.PORT ?? '3000';
const PORT = Number(rawPort);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new Error(`유효하지 않은 PORT 값입니다: "${rawPort}"`);
}

const app = createApp();

// HTTP 서버를 직접 생성하여 Socket.io 와 Express 를 동일 포트에서 운영
const httpServer = createServer(app);

// Socket.io 초기화
const tokenService = new TokenServiceImpl();
const userRepo = new PgUserRepository(pool);
const chatRepository = (app as any).chatRepository;
const notificationRepository = (app as any).notificationRepository;

if (chatRepository) {
  const io = initSocketIO(httpServer, tokenService, userRepo, chatRepository, notificationRepository);
  logger.info('Socket.io 서버 초기화 완료');

  // Socket.io 인스턴스를 app 에 저장 (다른 라우트에서 이벤트 emit 시 사용 가능)
  (app as any).io = io;
}

// Slowloris/느린 요청 방어 — 헤더·바디 수신 시간 상한. (CloudFront 뒤이지만 origin 직접 노출 대비.)
httpServer.headersTimeout = 20_000;   // 헤더 전체 수신 20s 내
httpServer.requestTimeout = 60_000;   // 요청(바디 포함) 전체 60s 내 — 대용량 이미지 업로드 여유
httpServer.keepAliveTimeout = 65_000; // ALB/CloudFront keep-alive 보다 길게(소켓 조기 종료 방지)

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, `doothing 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
