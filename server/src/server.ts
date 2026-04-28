import { createApp } from './app.js';

const rawPort = process.env.PORT ?? '3000';
const PORT = Number(rawPort);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new Error(`유효하지 않은 PORT 값입니다: "${rawPort}"`);
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`doothing 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
