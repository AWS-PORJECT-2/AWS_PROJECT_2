import type { PointService } from '../interfaces/point-service.js';
import type { EarnReason } from '../types/index.js';
import { logger } from '../logger.js';

/**
 * 일회성 적립 훅 (point earning hooks)
 *
 * 기존 시스템(인증/게시글/댓글)의 "작업 완료 시점"에서 호출하는 얇은 래퍼 모음이다.
 * 설계 문서 "통합 훅" 절을 그대로 따른다.
 *
 * 공통 원칙:
 * - 멱등(idempotent): `earnOnce` 자체가 사용자별 생애 1회만 적립하므로, 매 호출마다 불러도 안전하다.
 * - 비차단(non-throwing): 적립 실패가 본래 작업(회원가입/글/댓글 생성)을 롤백시키면 안 되므로
 *   모든 예외를 try/catch 로 삼키고(swallow) 로그만 남긴다. 멱등하므로 다음 트리거에서 재시도해도 안전하다.
 * - 선택적 의존성: 포인트 시스템이 아직 결선되지 않은 환경(일부 테스트/부분 와이어링)에서는
 *   `pointService` 가 `undefined` 일 수 있으므로, 이 경우 아무 일도 하지 않고 조용히 반환한다.
 */

/**
 * 지정한 일회성 적립 사유로 포인트를 적립한다. 절대 throw 하지 않는다(내부에서 swallow).
 * 호출부는 인증된 사용자 ID(`req.userId` 등)를 전달해야 한다.
 */
async function awardOnceSafe(
  pointService: PointService | undefined,
  userId: string,
  reason: EarnReason,
): Promise<void> {
  if (!pointService) return;
  try {
    await pointService.earnOnce(userId, reason);
  } catch (err) {
    logger.error(
      { err, userId, reason },
      '일회성 포인트 적립 실패 - 본래 작업은 정상 처리됨 (멱등하므로 재시도 가능)',
    );
  }
}

/**
 * 회원가입 적립 훅 (요구사항 1.1~1.4): 신규 사용자 최초 생성 직후 호출.
 */
export async function awardSignupPoints(
  pointService: PointService | undefined,
  userId: string,
): Promise<void> {
  await awardOnceSafe(pointService, userId, 'signup');
}

/**
 * 첫 게시글 적립 훅 (요구사항 2.1~2.4): 게시글/펀드 생성 성공 직후 호출.
 */
export async function awardFirstPostPoints(
  pointService: PointService | undefined,
  userId: string,
): Promise<void> {
  await awardOnceSafe(pointService, userId, 'first_post');
}

/**
 * 첫 댓글 적립 훅 (요구사항 3.1~3.4): 댓글 생성 성공 직후 호출.
 *
 * NOTE: 현재 이 코드베이스에는 댓글 생성 핸들러/라우트와 `comment` 테이블이 아직 존재하지 않는다.
 *       댓글 기능이 구현되는 시점에 그 생성 핸들러의 "생성 성공 직후"에서 인증된 사용자 ID를 전달하여
 *       이 함수를 호출하면 요구사항 3이 즉시 충족된다. 예:
 *
 *         // 댓글 생성 성공 응답 직전
 *         await awardFirstCommentPoints(pointService, req.userId);
 *
 *       earnOnce 가 멱등하므로 사용자가 댓글을 여러 번 작성해도 적립은 정확히 1회만 발생한다.
 */
export async function awardFirstCommentPoints(
  pointService: PointService | undefined,
  userId: string,
): Promise<void> {
  await awardOnceSafe(pointService, userId, 'first_comment');
}
