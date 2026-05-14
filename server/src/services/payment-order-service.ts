import type { Pool } from 'mysql2/promise';
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

    // 주문번호: ORD-YYYYMMDD-XXXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    const order = await this.orderRepo.create(
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
   * - WAITING_FOR_CONFIRM 상태에서만 허용.
   * - orders.status=PAID + payment_proofs.is_confirmed=true + payment_confirmations 인서트를
   *   하나의 트랜잭션으로 처리.
   * - fund_id 가 있으면 funds.current_amount 증가. 100% 도달 시 알림 발송 트리거.
   */
  async confirmPayment(adminId: number, orderId: number, request: ConfirmPaymentRequest): Promise<ConfirmPaymentResponse> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    if (order.status !== 'WAITING_FOR_CONFIRM') {
      throw new AppError('INVALID_ORDER_STATUS', '승인할 수 없는 주문 상태입니다');
    }
    if (!order.proof) {
      throw new AppError('NO_PROOF_UPLOADED', '입금 보고가 되지 않은 주문입니다');
    }

    let fundIdToNotify: number | null = null;
    let fundTitleToNotify: string | null = null;

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1) 주문 상태를 PAID로
      await conn.query(
        'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
        ['PAID', orderId]
      );

      // 2) 입금 확인증 is_confirmed=true
      await this.proofRepo.updateConfirmStatus(order.proof.id, true, conn);

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
      if (order.fundId && this.fundRepo) {
        const updatedFund = await this.fundRepo.incrementCurrentAmount(order.fundId, 1, conn);
        if (
          updatedFund &&
          !updatedFund.isNotified &&
          updatedFund.targetAmount > 0 &&
          updatedFund.currentAmount >= updatedFund.targetAmount
        ) {
          // 트랜잭션 안에서 is_notified=true 로 마킹 (중복 발송 방지)
          await this.fundRepo.markAsNotified(order.fundId, conn);
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
