import { AppError } from '../errors/app-error.js';

/**
 * AbortController 기반 타임아웃이 걸린 fetch.
 *
 * timeoutMs 안에 응답이 안 오면 AbortError 가 throw 된다 (호출자에서 catch 해
 * 적절한 AppError 로 매핑). 두 AI 어댑터에서 동일 패턴이 반복되어 공용 유틸로 추출.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 임의의 Promise 에 타임아웃을 건다. ms 안에 settle 되지 않으면 AppError(AI_TIMEOUT) 를 throw.
 *
 * AI 라우트에서 어댑터 호출이 무한 대기하는 것을 막기 위해 사용한다.
 */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AppError('AI_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
