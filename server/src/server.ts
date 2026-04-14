import { createApp } from './app';
const PORT = process.env.PORT ?? 3000;
const app = createApp();
app.listen(PORT, () => {
  console.log(`doothing 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
