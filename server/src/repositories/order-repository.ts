import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Order, OrderItem, OrderDetailResponse } from '../types/payment.js';

export interface OrderRepository {
  create(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId' | 'createdAt'>[]): Promise<Order>;
  findById(id: number): Promise<OrderDetailResponse | null>;
  findByUserId(userId: number): Promise<Order[]>;
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

  async findPendingOrders(): Promise<OrderDetailResponse[]> {
    const [orderRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT o.* FROM orders o
       INNER JOIN payment_proofs p ON o.id = p.order_id
       WHERE o.status = 'WAITING_FOR_CONFIRM'
       ORDER BY o.created_at ASC`
    );

    const orders: OrderDetailResponse[] = [];
    for (const row of orderRows) {
      const detail = await this.findById(row.id);
      if (detail) orders.push(detail);
    }

    return orders;
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
