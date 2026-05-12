import type pg from 'pg';
import type { PaymentEvent } from '../types/index.js';
import type { PaymentEventRepository } from './payment-event-repository.js';

export class PgPaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(event: PaymentEvent): Promise<PaymentEvent> {
    const result = await this.pool.query(
      `INSERT INTO payment_events (id, payment_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [event.id, event.paymentId, event.eventType, JSON.stringify(event.payload), event.createdAt],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByPaymentId(paymentId: string): Promise<PaymentEvent[]> {
    const result = await this.pool.query(
      'SELECT * FROM payment_events WHERE payment_id = $1 ORDER BY created_at ASC',
      [paymentId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): PaymentEvent {
    return {
      id: row.id as string,
      paymentId: row.payment_id as string,
      eventType: row.event_type as string,
      payload: (typeof row.payload === 'string'
        ? JSON.parse(row.payload)
        : row.payload) as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
    };
  }
}
