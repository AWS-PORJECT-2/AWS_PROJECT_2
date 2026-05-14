import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { PaymentProofRepository } from '../repositories/payment-proof-repository.js';
import type { PaymentConfirmationRepository } from '../repositories/payment-confirmation-repository.js';
import type { FundRepository } from '../repositories/fund-repository.js';
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  UploadProofResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  OrderDetailResponse,
} from '../types/payment.js';
import { AppError } from '../errors/app-error.js';
import { sendMailBatch, buildFundCompletedMail } from './mailer.js';
import { logger } from '../logger.js';

export interface PaymentOrderService {
  createOrder(userId: number, request: CreateOrderRequest): Promise<CreateOrderResponse>;
  reportPayment(userId: number, orderId: number, depositorName: string): Promise<UploadProofResponse>;
  confirmPayment(adminId: number, orderId: number, request: ConfirmPaymentRequest): Promise<ConfirmPaymentResponse>;
  getOrderDetail(userId: number, orderId: number): Promise<OrderDetailResponse>;
  getUserOrders(userId: number): Promise<OrderDetailResponse[]>;
  getPendingOrders(): Promise<OrderDetailResponse[]>;
}

export class PaymentOrderServiceImpl implements PaymentOrderService {
  constructor(
    private pool: Pool,
    private orderRepo: OrderRepository,
    private proofRepo: PaymentProofRepository,
    private confirmRepo: PaymentConfirmationRepository,
    private fundRepo?: FundRepository
  ) {}

  /**
   * 주문 생성.
   *
   * 보안 핵심: 클라이언트가 보낸 items[].price 는 절대 신뢰하지 않는다.
   *  - fundId 로 서버의 funds.unit_price 를 조회해 단가의 단일 출처(SSOT)로 사용
   *  - status === 'CLOSED' 이거나 fund 가 없으면 차단
   *  - quantity 는 양의 정수여야 하며, 가격 = unit_price * quantity 로 서버에서 재계산
   */
  async createOrder(userId: number, request: CreateOrderRequest): Promise<CreateOrderResponse> {
    if (!request.items || !Array.isArray(request.items) || request.items.length === 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', '주문 상품이 없습니다');
    }
    if (!request.shippingAddressId) {
      throw new AppError('MISSING_REQUIRED_FIELD', '배송지를 선택해주세요');
    }

    const fundId = Number(request.fundId);
    if (!Number.isInteger(fundId) || fundId <= 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', '유효한 fundId 가 필요합니다');
    }

    // === 서버 측 단가 조회 (Catalog Lookup) ===
    if (!this.fundRepo) {
      // fundRepo 미주입 — 운영 환경에선 발생 불가, 안전을 위해 차단
      throw new AppError('FEATURE_UNAVAILABLE', '주문 처리 모듈 초기화 오류');
    }
    const fund = await this.fundRepo.findById(fundId);
    if (!fund) {
      throw new AppError('FUND_NOT_FOUND', '해당 펀드를 찾을 수 없습니다');
    }
    if (fund.status === 'CLOSED') {
      throw new AppError('FUND_CLOSED', '판매가 종료된 펀드입니다');
    }
    if (!Number.isFinite(fund.unitPrice) || fund.unitPrice <= 0) {
      // 서버 데이터 결함 — 사용자가 결제하지 못하도록 차단
      throw new AppError('INTERNAL_ERROR', '펀드 단가 정보가 올바르지 않습니다');
    }

    // === 서버 사이드 가격 재계산 ===
    type SafeItem = { productName: string; size: string | undefined; quantity: number; price: number };
    const safeItems: SafeItem[] = [];
    let totalPrice = 0;

    for (const raw of request.items) {
      const productName = typeof raw.productName === 'string' ? raw.productName.trim() : '';
      if (!productName) {
        throw new AppError('MISSING_REQUIRED_FIELD', '상품명이 필요합니다');
      }
      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
        throw new AppError('INVALID_QUANTITY', '수량은 1~100 사이의 정수여야 합니다');
      }

      // 클라이언트 raw.price 는 절대 사용하지 않음
      const unitPrice = fund.unitPrice;
      const itemTotal = unitPrice * quantity;

      safeItems.push({
        productName,
        size: typeof raw.size === 'string' ? raw.size : undefined,
        quantity,
        price: unitPrice, // order_items 에 저장될 단가 = 서버 단가
      });
      totalPrice += itemTotal;
    }

    if (totalPrice <= 0) {
      throw new AppError('INTERNAL_ERROR', '주문 총액이 유효하지 않습니다');
    }

    // === 주문번호 생성 + 재시도 (CSPRNG 기반) ===
    // 형식: ORD-YYYYMMDD-XXXXXXXXXX (날짜 + Base36 10자리, 대문자)
    // 엔트로피: 36^10 ≈ 3.65 × 10^15 — 일일 충돌 확률 사실상 0.
    // UNIQUE 제약 위반(ER_DUP_ENTRY) 발생 시 최대 5회 재시도.
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

    const MAX_ATTEMPTS = 5;
    let order;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const orderNumber = `ORD-${dateStr}-${generateOrderSuffix()}`;
      try {
        order = await this.orderRepo.create(
          {
            orderNumber,
            userId,
            fundId,
            shippingAddressId: request.shippingAddressId,
            totalPrice, // 서버 계산값
            status: 'PENDING',
          },
          safeItems
        );
        break; // 성공
      } catch (err: unknown) {
        const e = err as { code?: string; errno?: number };
        const isDup = e.code === 'ER_DUP_ENTRY' || e.errno === 1062;
        if (!isDup) throw err;
        lastError = err;
        // 충돌 — 다음 시도
        logger.warn({ attempt, orderNumber }, '주문번호 충돌 — 재시도');
      }
    }
    if (!order) {
      logger.error({ err: lastError, attempts: MAX_ATTEMPTS }, '주문번호 충돌이 반복되어 생성 실패');
      throw new AppError('INTERNAL_ERROR', '주문번호 생성에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요');
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalPrice: order.totalPrice, // 서버 계산값
      bankInfo: {
        bankName: '토스뱅크',
        accountNumber: '1002-5655-8980',
        accountHolder: '공동구매 계좌',
      },
      status: order.status,
    };
  }

  /**
   * 유저가 입금 후 입금자명을 보고하는 단계.
   * - PENDING 상태에서만 허용.
   * - payment_proofs 인서트 + orders.status=WAITING_FOR_CONFIRM 을 트랜잭션으로 묶음.
   */
  async reportPayment(userId: number, orderId: number, depositorName: string): Promise<UploadProofResponse> {
    if (!depositorName || !depositorName.trim()) {
      throw new AppError('MISSING_REQUIRED_FIELD', '입금자명을 입력해주세요');
    }

    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    if (order.userId !== userId) throw new AppError('FORBIDDEN', '해당 주문에 대한 권한이 없습니다');
    if (order.status !== 'PENDING') {
      throw new AppError('INVALID_ORDER_STATUS', '이미 입금 보고가 완료된 주문입니다');
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const proof = await this.proofRepo.create(
        {
          orderId,
          depositorName: depositorName.trim(),
          isConfirmed: false,
        },
        conn
      );

      // 같은 트랜잭션에서 직접 UPDATE
      await conn.query(
        'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
        ['WAITING_FOR_CONFIRM', orderId]
      );

      await conn.commit();

      return {
        proofId: proof.id,
        uploadedAt: proof.uploadedAt,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 관리자가 입금자명을 대조하고 승인.
   *
   * 동시성 (TOCTOU 방지):
   *  - 트랜잭션 외부에서 status 를 미리 체크해도 두 관리자가 동시에 누르면 둘 다 통과 가능 → race.
   *  - 따라서 트랜잭션 안에서 조건부 UPDATE 로 원자적 상태 전이를 수행:
   *      UPDATE orders SET status='PAID' WHERE id=? AND status='WAITING_FOR_CONFIRM'
   *  - affectedRows === 0 이면 다른 요청이 이미 처리한 것 → INVALID_ORDER_STATUS 로 롤백.
   *  - 이 가드 통과 후에만 incrementCurrentAmount, confirmRepo.create 등 후속 작업 실행 → 펀딩 이중 합산 차단.
   */
  async confirmPayment(adminId: number, orderId: number, request: ConfirmPaymentRequest): Promise<ConfirmPaymentResponse> {
    // 사전 read — 친절한 에러 메시지를 위한 prefetch (실제 정합성 보장은 트랜잭션 내부에서)
    const initial = await this.orderRepo.findById(orderId);
    if (!initial) throw new AppError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    if (!initial.proof) throw new AppError('NO_PROOF_UPLOADED', '입금 보고가 되지 않은 주문입니다');

    let fundIdToNotify: number | null = null;
    let fundTitleToNotify: string | null = null;

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1) 원자적 상태 전이 — WAITING_FOR_CONFIRM → PAID
      const [updateResult] = await conn.query<ResultSetHeader>(
        `UPDATE orders SET status = 'PAID', updated_at = NOW()
         WHERE id = ? AND status = 'WAITING_FOR_CONFIRM'`,
        [orderId]
      );

      if (updateResult.affectedRows === 0) {
        // 다른 요청이 이미 처리했거나 잘못된 상태 — 후속 작업 절대 실행 금지.
        throw new AppError('INVALID_ORDER_STATUS', '승인할 수 없는 주문 상태입니다 (이미 처리되었거나 상태가 변경되었습니다)');
      }

      // 2) 입금 확인증 is_confirmed=true
      await this.proofRepo.updateConfirmStatus(initial.proof.id, true, conn);

      // 3) 확인 이력 추가
      const confirmation = await this.confirmRepo.create(
        {
          orderId,
          confirmedBy: adminId,
          memo: request.memo || null,
        },
        conn
      );

      // 4) fund 누적치 증가 + 100% 달성 검증
      //    위 1) 단계가 한 번만 통과하므로 이 블록도 주문당 정확히 한 번만 실행됨 (이중 합산 방지).
      if (initial.fundId && this.fundRepo) {
        const updatedFund = await this.fundRepo.incrementCurrentAmount(initial.fundId, 1, conn);
        if (
          updatedFund &&
          !updatedFund.isNotified &&
          updatedFund.targetAmount > 0 &&
          updatedFund.currentAmount >= updatedFund.targetAmount
        ) {
          // 트랜잭션 안에서 is_notified=true 로 마킹 (중복 발송 방지)
          await this.fundRepo.markAsNotified(initial.fundId, conn);
          fundIdToNotify = updatedFund.id;
          fundTitleToNotify = updatedFund.title;
        }
      }

      await conn.commit();

      // 트랜잭션 커밋 후 비동기 메일 발송 (응답 차단하지 않음)
      if (fundIdToNotify !== null && fundTitleToNotify !== null && this.fundRepo) {
        this.sendFundCompletedNotification(fundIdToNotify, fundTitleToNotify).catch((err) => {
          logger.error({ err, fundId: fundIdToNotify }, '펀딩 달성 알림 메일 발송 실패');
        });
      }

      return {
        orderId,
        status: 'PAID',
        confirmedBy: confirmation.confirmedBy,
        confirmedAt: confirmation.confirmedAt,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 100% 달성 알림 - 해당 fund 에 주문을 넣은 모든 유저의 학교 이메일로 발송.
   * Promise.all 로 병렬 처리, 실패는 로그로만 남김.
   */
  private async sendFundCompletedNotification(fundId: number, fundTitle: string): Promise<void> {
    if (!this.fundRepo) return;
    const recipients = await this.fundRepo.getOrderUserEmails(fundId);
    if (recipients.length === 0) {
      logger.info({ fundId, fundTitle }, '펀딩 100% 달성 — 발송 대상자 없음');
      return;
    }

    const messages = recipients.map((r) => buildFundCompletedMail(r.email, fundTitle));
    const result = await sendMailBatch(messages);
    logger.info(
      { fundId, fundTitle, recipients: recipients.length, ...result },
      '펀딩 100% 달성 알림 발송'
    );
  }

  async getOrderDetail(userId: number, orderId: number): Promise<OrderDetailResponse> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    if (order.userId !== userId) throw new AppError('FORBIDDEN', '해당 주문에 대한 권한이 없습니다');
    return order;
  }

  async getUserOrders(userId: number): Promise<OrderDetailResponse[]> {
    // 배치 조회로 N+1 회피
    return this.orderRepo.findDetailsByUserId(userId);
  }

  async getPendingOrders(): Promise<OrderDetailResponse[]> {
    return this.orderRepo.findPendingOrders();
  }
}

/**
 * 암호학적으로 안전한 주문번호 접미사.
 *  - randomBytes(8) → BigInt → Base36 (대문자) → 좌측 0 패딩 10자리
 *  - 엔트로피: 36^10 ≈ 3.65 × 10^15
 */
function generateOrderSuffix(): string {
  const buf = randomBytes(8);
  const big = buf.readBigUInt64BE(0);
  const max = 36n ** 10n;
  const v = big % max;
  return v.toString(36).toUpperCase().padStart(10, '0');
}
