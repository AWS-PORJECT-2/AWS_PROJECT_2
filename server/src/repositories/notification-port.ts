import type { PoolClient } from 'pg';

/**
 * 포인트 변동 알림 입력. 기존 `notification` 테이블(마이그레이션 003)에 기록할
 * 최소 정보만 담는 좁은 형태. (설계: NotificationPort)
 */
export interface PointNotificationInput {
  userId: string;
  type: 'point_earn' | 'point_spend';
  title: string;
  body: string; // 적립/차감 금액과 사유 포함
}

/**
 * 포인트 변동 알림을 기록하는 좁은 포트.
 * 적립·소모 거래와 같은 DB 트랜잭션에 참여하기 위해 `client` 를 주입받는다.
 * (요구사항 1.4, 2.4, 3.4, 4.6, 5.6)
 */
export interface NotificationPort {
  create(input: PointNotificationInput, client?: PoolClient | null): Promise<void>;
}

/**
 * InMemory NotificationPort 구현.
 *
 * 생성된 알림을 `created` 배열에 누적하여, 속성 6(상태를 변화시킨 거래 1건당
 * 알림 1건) 같은 테스트에서 알림 생성 여부와 본문을 검증할 수 있게 한다.
 * DB 트랜잭션 의미가 없으므로 `client` 인자는 무시한다.
 */
export class InMemoryNotificationPort implements NotificationPort {
  /** 생성된 알림 목록(테스트 어서션용, 추가 순서 유지). */
  public readonly created: PointNotificationInput[] = [];

  async create(input: PointNotificationInput, _client?: PoolClient | null): Promise<void> {
    // 호출 시점 값의 스냅샷을 저장하여 이후 외부 변경에 영향받지 않게 한다.
    this.created.push({ ...input });
  }

  /** 수집된 알림을 초기화(테스트 간 재사용 시). */
  clear(): void {
    this.created.length = 0;
  }
}
