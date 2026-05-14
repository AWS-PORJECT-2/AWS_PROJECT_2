import { createServer } from 'node:http';
import { createApp } from './app.js';
import { attachSocketServer } from './socket.js';
import { logger } from './logger.js';

const rawPort = process.env.PORT ?? '3000';
const PORT = Number(rawPort);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new Error(`유효하지 않은 PORT 값입니다: "${rawPort}"`);
}

(async () => {
  const { app, userRepo, chatRepo, frontendUrl } = await createApp();

  // HTTP 서버 생성 후 Express + Socket.io 양쪽에 연결
  const httpServer = createServer(app);
  attachSocketServer(httpServer, chatRepo, userRepo, frontendUrl);

  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, `doothing 서버가 http://localhost:${PORT} 에서 실행 중입니다 (Socket.io /chat 활성)`);
  });
})();
