import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export interface FundRow {
  id: number;
  title: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  isNotified: boolean;
  notifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FundRepository {
  findById(id: number, conn?: PoolConnection): Promise<FundRow | null>;
  /** current_amount += increment, 락 + 결과 반환 */
  incrementCurrentAmount(id: number, increment: number, conn?: PoolConnection): Promise<FundRow | null>;
  markAsNotified(id: number, conn?: PoolConnection): Promise<void>;
  getOrderUserEmails(fundId: number): Promise<{ userId: number; email: string; name: string }[]>;
}

export class MySQLFundRepository implements FundRepository {
  constructor(private pool: Pool) {}

  async findById(id: number, conn?: PoolConnection): Promise<FundRow | null> {
    const exec = conn ?? this.pool;
    const [rows] = await exec.query<RowDataPacket[]>(
      'SELECT * FROM funds WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * trx 내에서 row lock 후 증가. 호출자가 보낸 connection 으로 같은 트랜잭션 안에서 처리되어야 함.
   * 동시 승인 race 방지를 위해 SELECT ... FOR UPDATE 적용.
   */
  async incrementCurrentAmount(id: number, increment: number, conn?: PoolConnection): Promise<FundRow | null> {
    const exec = conn ?? this.pool;
    await exec.query<RowDataPacket[]>(
      'SELECT id FROM funds WHERE id = ? FOR UPDATE',
      [id]
    );
    await exec.query<ResultSetHeader>(
      'UPDATE funds SET current_amount = current_amount + ? WHERE id = ?',
      [increment, id]
    );
    return this.findById(id, conn);
  }

  async markAsNotified(id: number, conn?: PoolConnection): Promise<void> {
    const exec = conn ?? this.pool;
    await exec.query<ResultSetHeader>(
      'UPDATE funds SET is_notified = TRUE, notified_at = NOW() WHERE id = ?',
      [id]
    );
  }

  /**
   * 해당 fund 에 주문(예약)을 넣은 모든 유저의 이메일 조회.
   * - DISTINCT user 단위
   * - email 이 NULL/빈 값이면 제외
   */
  async getOrderUserEmails(fundId: number): Promise<{ userId: number; email: string; name: string }[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DISTINCT u.id AS user_id, u.email, u.name
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       WHERE o.fund_id = ?
         AND u.email IS NOT NULL
         AND u.email <> ''`,
      [fundId]
    );
    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
    }));
  }

  private mapRow(row: RowDataPacket): FundRow {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      targetAmount: row.target_amount,
      currentAmount: row.current_amount,
      isNotified: Boolean(row.is_notified),
      notifiedAt: row.notified_at ? new Date(row.notified_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
