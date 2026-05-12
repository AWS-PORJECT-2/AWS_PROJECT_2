import type { Participation, ParticipationStatus } from '../types/index.js';
import type { PoolClient } from 'pg';

export interface ParticipationRepository {
  create(participation: Participation, client?: PoolClient | null): Promise<Participation>;
  findByUserAndGroupBuy(userId: string, groupbuyId: string): Promise<Participation | null>;
  findConfirmedByGroupBuy(groupbuyId: string): Promise<Participation[]>;
  updateStatus(id: string, status: ParticipationStatus, client?: PoolClient | null): Promise<void>;
  cancelAllByGroupBuy(groupbuyId: string): Promise<void>;
}

