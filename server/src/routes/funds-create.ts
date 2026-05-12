import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const DEPARTMENT_MAX = 50;
const DESIGN_FEE_MAX = 50000;
const TARGET_QTY_MAX = 500;

/**
 * POST /api/funds  (펀드 개설)
 *
 * 사장님 영역 화면(fund-create.html)이 호출하는 엔드포인트.
 * 실제 INSERT 로직은 담당 B(B-4 fund Repository, B-5 라우트)에서 채워질 예정.
 *
 * 이 placeholder 는 다음을 보장:
 *  - 인증 검사 (req.userId 필요)
 *  - 입력값 화이트리스트 + 길이/범위 검증
 *  - finalPrice 는 클라이언트 입력 무시하고 서버에서만 계산하도록 강제
 *
 * B 담당이 채울 부분은 // TODO 로 명시.
 */
export function createFundsCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('AUTH_FAILED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const designId = stringField(body.designId);
    const title = stringField(body.title);
    const description = stringField(body.description, '');
    const department = stringField(body.department);
    const deadline = stringField(body.deadline);
    const designFee = intField(body.designFee, 0, DESIGN_FEE_MAX);
    const targetQuantity = intField(body.targetQuantity, 1, TARGET_QTY_MAX);

    const errors: string[] = [];
    if (!designId) errors.push('designId');
    if (!title || title.length > TITLE_MAX) errors.push('title');
    if (description && description.length > DESCRIPTION_MAX) errors.push('description');
    if (!department || department.length > DEPARTMENT_MAX) errors.push('department');
    if (!isValidFutureDate(deadline)) errors.push('deadline');
    if (designFee === null) errors.push('designFee');
    if (targetQuantity === null) errors.push('targetQuantity');

    if (errors.length > 0) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 필드: ${errors.join(', ')}`),
      ));
      return;
    }

    // TODO (담당 B):
    //  1. designId 로 design 조회 → creator_id 가 userId 와 일치하는지 검사
    //  2. design.product_id 로 product 조회 → base_price 획득
    //  3. final_price = base_price + 인쇄비(서버 상수) + design_fee + platform_fee 계산
    //  4. fund 테이블에 INSERT (status='open', current_quantity=0)
    //  5. tryOnImages 가 있으면 별도 fund_image 테이블 또는 design 레코드에 첨부
    //  6. 알림 자동 생성: 본인에게 "펀드가 개설되었습니다"
    //  7. 응답: { id }

    // 사용자에게는 친화 메시지만 노출하고, 내부 사유는 서버 로그로 남긴다.
    console.warn('[funds-create] placeholder hit', {
      userId, reason: 'fund Repository 미연결 — 백엔드 도메인 작업 필요',
    });
    res.status(503).json(createErrorResponse(
      new AppError('FEATURE_UNAVAILABLE', '펀드 개설 기능은 곧 열립니다. 잠시만 기다려 주세요.'),
    ));
  };
}

function stringField(v: unknown, fallback?: string): string {
  if (typeof v !== 'string') return fallback ?? '';
  return v.trim();
}

function intField(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? Math.floor(v) : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/**
 * deadline 검증.
 *  1. YYYY-MM-DD 형식
 *  2. 실제 존재하는 날짜 (예: 2024-13-99 거부 — Date 가 자동 보정해도 컴포넌트 매칭으로 잡음)
 *  3. 오늘보다 미래 (오늘 자정 KST 기준)
 *
 * 단순 정규식만으론 2024-02-30 같은 가짜 날짜를 통과시킨다.
 */
function isValidFutureDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map((p) => Number(p));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  // 오늘 자정 (로컬 타임존) 기준 — 같은 날짜는 거부, 다음 날부터 허용.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dt.getTime() > today.getTime();
}
