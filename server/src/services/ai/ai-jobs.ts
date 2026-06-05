import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/app-error.js';
import { logger } from '../../logger.js';

// 비동기 AI 생성 작업 저장소(인메모리).
//  AI 이미지 생성(gpt-image-2)은 1분 이상 걸릴 수 있는데 CloudFront 오리진 타임아웃이 60초라
//  단일 요청으로는 못 받는다 → 작업을 백그라운드로 돌리고 jobId 를 즉시 반환, 프론트가 폴링으로 회수.
//  단일 PM2 프로세스라 인메모리 Map 으로 충분(재시작 시 진행중 작업은 소실 — 사용자가 재시도).

type JobStatus = 'pending' | 'done' | 'error';

interface Job {
  status: JobStatus;
  userId: string;
  ts: number;                          // 마지막 갱신(생성/완료) 시각 — TTL 청소 기준
  result?: Record<string, unknown>;    // 완료 응답 본문 (예: { blueprintDataUrl })
  errMessage?: string;                 // 실패 시 사용자 노출 메시지
}

const JOB_TTL_MS = 10 * 60 * 1000;     // 완료/방치 10분 후 청소
const jobs = new Map<string, Job>();

function sweep(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.ts > JOB_TTL_MS) jobs.delete(id);
  }
}

// 백그라운드 작업 시작 → jobId 즉시 반환. work() 의 결과/에러는 job 에 저장(폴링으로 회수).
export function startAiJob(userId: string, label: string, work: () => Promise<Record<string, unknown>>): string {
  sweep();
  const id = randomUUID();
  jobs.set(id, { status: 'pending', userId, ts: Date.now() });
  void (async () => {
    try {
      const result = await work();
      const j = jobs.get(id);
      if (j) { j.status = 'done'; j.result = result; j.ts = Date.now(); }
    } catch (err) {
      const j = jobs.get(id);
      if (j) {
        j.status = 'error';
        j.errMessage = err instanceof AppError ? err.message : 'AI 생성에 실패했어요. 잠시 후 다시 시도해 주세요.';
        j.ts = Date.now();
      }
      logger.warn({ jobId: id, userId, label, err: err instanceof Error ? err.message : String(err) }, '[AI-JOB] 작업 실패');
    }
  })();
  return id;
}

export function getAiJob(id: string): Job | undefined {
  return jobs.get(id);
}
