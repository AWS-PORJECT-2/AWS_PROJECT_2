import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Order, OrderItem, OrderDetailResponse } from '../types/payment.js';

export interface OrderRepository {
  create(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId' | 'createdAt'>[]): Promise<Order>;
  findById(id: number): Promise<OrderDetailResponse | null>;
  findByUserId(userId: number): Promise<Order[]>;
  /** 배치 조회 — N+1 방지 */
  findDetailsByUserId(userId: number): Promise<OrderDetailResponse[]>;
  findPendingOrders(): Promise<OrderDetailResponse[]>;
  updateStatus(id: number, status: Order['status']): Promise<void>;
}

export class MySQLOrderRepository implements OrderRepository {
  constructor(private pool: Pool) {}

  async create(
    order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
    items: Omit<OrderItem, 'id' | 'orderId' | 'createdAt'>[]
  ): Promise<Order> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 주문 생성
      const [orderResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO orders (order_number, user_id, fund_id, shipping_address_id, total_price, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [order.orderNumber, order.userId, order.fundId, order.shippingAddressId, order.totalPrice, order.status]
      );

      const orderId = orderResult.insertId;

      // 주문 상세 생성
      for (const item of items) {
        await connection.query(
          `INSERT INTO order_items (order_id, product_name, size, quantity, price)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.productName, item.size, item.quantity, item.price]
        );
      }

      await connection.commit();

      // 생성된 주문 조회
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );

      return this.mapToOrder(rows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findById(id: number): Promise<OrderDetailResponse | null> {
    const [orderRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    if (orderRows.length === 0) return null;

    const order = this.mapToOrder(orderRows[0]);

    // 주문 상세 조회
    const [itemRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM order_items WHERE order_id = ?',
      [id]
    );

    // 입금 확인증 조회
    const [proofRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM payment_proofs WHERE order_id = ? ORDER BY uploaded_at DESC LIMIT 1',
      [id]
    );

    // 확인 이력 조회
    const [confirmRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM payment_confirmations WHERE order_id = ? ORDER BY confirmed_at DESC LIMIT 1',
      [id]
    );

    // 배송지 조회
    const [addressRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM shipping_addresses WHERE id = ?',
      [order.shippingAddressId]
    );

    return {
      ...order,
      items: itemRows.map(this.mapToOrderItem),
      proof: proofRows.length > 0 ? this.mapToPaymentProof(proofRows[0]) : null,
      confirmation: confirmRows.length > 0 ? this.mapToPaymentConfirmation(confirmRows[0]) : null,
      shippingAddress: addressRows.length > 0 ? this.mapToShippingAddress(addressRows[0]) : null,
    };
  }

  async findByUserId(userId: number): Promise<Order[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    return rows.map(this.mapToOrder);
  }

  /**
   * 배치 조회: 한 유저의 모든 주문 + 관련 데이터(items/proof/confirmation/address)를
   * 5개의 쿼리로 일괄 조회 후 메모리에서 조립한다 (N+1 방지).
   */
  async findDetailsByUserId(userId: number): Promise<OrderDetailResponse[]> {
    const [orderRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    const orders = orderRows.map(this.mapToOrder);
    if (orders.length === 0) return [];

    return this.assembleDetails(orders);
  }

  async findPendingOrders(): Promise<OrderDetailResponse[]> {
    const [orderRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT o.* FROM orders o
       INNER JOIN payment_proofs p ON o.id = p.order_id
       WHERE o.status = 'WAITING_FOR_CONFIRM'
       ORDER BY o.created_at ASC`
    );
    const orders = orderRows.map(this.mapToOrder);
    if (orders.length === 0) return [];

    return this.assembleDetails(orders);
  }

  /**
   * 주문 배열을 받아 관련 부속 데이터를 IN 쿼리로 일괄 조회 후 OrderDetailResponse[] 로 조립.
   * 쿼리 수: 주문 N개 → 4번 (items, proofs, confirmations, addresses) — 총 5번 고정.
   */
  private async assembleDetails(orders: Order[]): Promise<OrderDetailResponse[]> {
    const orderIds = orders.map((o) => o.id);
    const addressIds = orders
      .map((o) => o.shippingAddressId)
      .filter((v): v is number => v != null);

    // 1) 주문 상세 (items)
    const [itemRows] = orderIds.length === 0
      ? [[] as RowDataPacket[]]
      : await this.pool.query<RowDataPacket[]>(
          'SELECT * FROM order_items WHERE order_id IN (?)',
          [orderIds]
        );

    // 2) 입금 확인증 (각 주문의 최근 1건만 필요 → 일단 전부 가져와서 메모리 그룹화)
    const [proofRows] = orderIds.length === 0
      ? [[] as RowDataPacket[]]
      : await this.pool.query<RowDataPacket[]>(
          'SELECT * FROM payment_proofs WHERE order_id IN (?) ORDER BY uploaded_at DESC',
          [orderIds]
        );

    // 3) 확인 이력 (각 주문의 최근 1건)
    const [confirmRows] = orderIds.length === 0
      ? [[] as RowDataPacket[]]
      : await this.pool.query<RowDataPacket[]>(
          'SELECT * FROM payment_confirmations WHERE order_id IN (?) ORDER BY confirmed_at DESC',
          [orderIds]
        );

    // 4) 배송지 (참조하는 id 만)
    const [addressRows] = addressIds.length === 0
      ? [[] as RowDataPacket[]]
      : await this.pool.query<RowDataPacket[]>(
          'SELECT * FROM shipping_addresses WHERE id IN (?)',
          [addressIds]
        );

    // === 메모리 그룹화 ===
    const itemsByOrder = new Map<number, OrderItem[]>();
    for (const r of itemRows) {
      const item = this.mapToOrderItem(r);
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    // proof / confirmation 은 첫 번째(가장 최근)만 사용
    const proofByOrder = new Map<number, ReturnType<typeof this.mapToPaymentProof>>();
    for (const r of proofRows) {
      const p = this.mapToPaymentProof(r);
      if (!proofByOrder.has(p.orderId)) proofByOrder.set(p.orderId, p);
    }

    const confirmByOrder = new Map<number, ReturnType<typeof this.mapToPaymentConfirmation>>();
    for (const r of confirmRows) {
      const c = this.mapToPaymentConfirmation(r);
      if (!confirmByOrder.has(c.orderId)) confirmByOrder.set(c.orderId, c);
    }

    const addressById = new Map<number, ReturnType<typeof this.mapToShippingAddress>>();
    for (const r of addressRows) {
      const a = this.mapToShippingAddress(r);
      addressById.set(a.id, a);
    }

    // === 조립 ===
    return orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
      proof: proofByOrder.get(order.id) ?? null,
      confirmation: confirmByOrder.get(order.id) ?? null,
      shippingAddress:
        order.shippingAddressId != null
          ? (addressById.get(order.shippingAddressId) ?? null)
          : null,
    }));
  }

  async updateStatus(id: number, status: Order['status']): Promise<void> {
    await this.pool.query(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
  }

  private mapToOrder(row: RowDataPacket): Order {
    return {
      id: row.id,
      orderNumber: row.order_number,
      userId: row.user_id,
      fundId: row.fund_id,
      shippingAddressId: row.shipping_address_id,
      totalPrice: row.total_price,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapToOrderItem(row: RowDataPacket): OrderItem {
    return {
      id: row.id,
      orderId: row.order_id,
      productName: row.product_name,
      size: row.size,
      quantity: row.quantity,
      price: row.price,
      createdAt: new Date(row.created_at),
    };
  }

  private mapToPaymentProof(row: RowDataPacket) {
    return {
      id: row.id,
      orderId: row.order_id,
      depositorName: row.depositor_name,
      isConfirmed: Boolean(row.is_confirmed),
      uploadedAt: new Date(row.uploaded_at),
    };
  }

  private mapToPaymentConfirmation(row: RowDataPacket) {
    return {
      id: row.id,
      orderId: row.order_id,
      confirmedBy: row.confirmed_by,
      confirmedAt: new Date(row.confirmed_at),
      memo: row.memo,
    };
  }

  private mapToShippingAddress(row: RowDataPacket) {
    return {
      id: row.id,
      userId: row.user_id,
      label: row.label,
      recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone,
      postalCode: row.postal_code,
      roadAddress: row.road_address,
      jibunAddress: row.jibun_address,
      detailAddress: row.detail_address,
      isDefault: Boolean(row.is_default),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
