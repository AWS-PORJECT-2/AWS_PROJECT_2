import type { Pool } from 'mysql2/promise';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { PaymentProofRepository } from '../repositories/payment-proof-repository.js';
import type { PaymentConfirmationRepository } from '../repositories/payment-confirmation-repository.js';
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  UploadProofResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  OrderDetailResponse,
} from '../types/payment.js';
import { AppError } from '../errors/app-error.js';

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
    private confirmRepo: PaymentConfirmationRepository
  ) {}

  async createOrder(userId: number, request: CreateOrderRequest): Promise<CreateOrderResponse> {
    if (!request.items || !Array.isArray(request.items) || request.items.length === 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', '주문 상품이 없습니다');
    }
    if (!request.shippingAddressId) {
      throw new AppError('MISSING_REQUIRED_FIELD', '배송지를 선택해주세요');
    }

    const totalPrice = request.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // 주문번호: ORD-YYYYMMDD-XXXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    const order = await this.orderRepo.create(
      {
        orderNumber,
        userId,
        fundId: request.fundId || null,
        shippingAddressId: request.shippingAddressId,
        totalPrice,
        status: 'PENDING',
      },
      request.items
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalPrice: order.totalPrice,
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

      await conn.commit();

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

  async getOrderDetail(userId: number, orderId: number): Promise<OrderDetailResponse> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    if (order.userId !== userId) throw new AppError('FORBIDDEN', '해당 주문에 대한 권한이 없습니다');
    return order;
  }

  async getUserOrders(userId: number): Promise<OrderDetailResponse[]> {
    const orders = await this.orderRepo.findByUserId(userId);
    const details: OrderDetailResponse[] = [];
    for (const order of orders) {
      const detail = await this.orderRepo.findById(order.id);
      if (detail) details.push(detail);
    }
    return details;
  }

  async getPendingOrders(): Promise<OrderDetailResponse[]> {
    return this.orderRepo.findPendingOrders();
  }
}
