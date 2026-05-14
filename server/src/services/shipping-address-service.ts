import type { Pool } from 'mysql2/promise';
import type {
  ShippingAddressRepository,
  ShippingAddressRow,
  CreateAddressInput,
  UpdateAddressInput,
} from '../repositories/shipping-address-repository.js';

/**
 * 배송지 관리 서비스.
 *
 * 핵심 규칙:
 * - 사용자당 최소 1개 유지 (마지막 1개는 삭제 차단)
 * - 기본 배송지는 항상 정확히 1개 (생성/삭제 시 자동 보정)
 * - 변경/삭제는 트랜잭션 보장 — 모든 INSERT/UPDATE/DELETE 가 같은 connection 안에서 실행
 */
export class ShippingAddressService {
  constructor(private pool: Pool, private repo: ShippingAddressRepository) {}

  async list(userId: number): Promise<ShippingAddressRow[]> {
    return this.repo.findByUser(userId);
  }

  async getById(userId: number, id: number): Promise<ShippingAddressRow> {
    const addr = await this.repo.findById(id);
    if (!addr || addr.userId !== userId) {
      throw new ServiceError('NOT_FOUND', '배송지를 찾을 수 없습니다', 404);
    }
    return addr;
  }

  /**
   * 첫 주소면 자동으로 isDefault=true. 명시적으로 isDefault 요청하면 다른 주소들은 false 처리.
   * → countByUser / clearDefault / create 모두 같은 트랜잭션 안에서 실행되어야 함.
   */
  async create(userId: number, input: Omit<CreateAddressInput, 'userId'>): Promise<ShippingAddressRow> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const existingCount = await this.repo.countByUser(userId, conn);
      const shouldBeDefault = input.isDefault === true || existingCount === 0;

      if (shouldBeDefault && existingCount > 0) {
        await this.repo.clearDefault(userId, conn);
      }

      const created = await this.repo.create(
        { ...input, userId, isDefault: shouldBeDefault },
        conn
      );

      await conn.commit();
      return created;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async update(userId: number, id: number, input: UpdateAddressInput): Promise<ShippingAddressRow> {
    // update 자체는 단일 행 변경 — 트랜잭션 불필요. 그러나 일관성을 위해 트랜잭션으로 묶어
    // 권한 검사와 UPDATE 사이 race(다른 요청이 row 를 지움)를 좁힌다.
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const existing = await this.repo.findById(id, conn);
      if (!existing || existing.userId !== userId) {
        throw new ServiceError('NOT_FOUND', '배송지를 찾을 수 없습니다', 404);
      }
      await this.repo.update(id, input, conn);
      const updated = await this.repo.findById(id, conn);
      if (!updated) throw new ServiceError('NOT_FOUND', '업데이트 후 조회 실패', 500);

      await conn.commit();
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 기본 배송지 변경 — 트랜잭션으로 다른 주소 default 일괄 false 처리.
   */
  async setDefault(userId: number, id: number): Promise<ShippingAddressRow> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const target = await this.repo.findById(id, conn);
      if (!target || target.userId !== userId) {
        throw new ServiceError('NOT_FOUND', '배송지를 찾을 수 없습니다', 404);
      }

      await this.repo.setDefault(userId, id, conn);
      const updated = await this.repo.findById(id, conn);

      await conn.commit();
      if (!updated) throw new ServiceError('NOT_FOUND', '업데이트 후 조회 실패', 500);
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 삭제. 마지막 1개는 차단. 기본 배송지를 삭제하면 다른 주소를 자동 승격.
   * 권한 검사·count·delete·승격 모두 같은 트랜잭션 안에서 실행 → 부분 실패 시 전체 롤백.
   */
  async delete(userId: number, id: number): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const target = await this.repo.findById(id, conn);
      if (!target || target.userId !== userId) {
        throw new ServiceError('NOT_FOUND', '배송지를 찾을 수 없습니다', 404);
      }

      const count = await this.repo.countByUser(userId, conn);
      if (count <= 1) {
        throw new ServiceError('LAST_ADDRESS', '마지막 배송지는 삭제할 수 없습니다', 400);
      }

      await this.repo.delete(id, conn);

      // 기본 배송지를 지웠다면 남은 주소 중 가장 최근 것을 기본으로 승격
      if (target.isDefault) {
        const remaining = await this.repo.findByUser(userId, conn);
        if (remaining.length > 0) {
          await this.repo.setDefault(userId, remaining[0].id, conn);
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export class ServiceError extends Error {
  constructor(public code: string, message: string, public httpStatus: number) {
    super(message);
  }
}
