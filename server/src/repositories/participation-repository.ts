import type { Participation, ParticipationStatus } from '../types/index.js';

export interface ParticipationRepository {
  create(participation: Participation): Promise<Participation>;
  findByUserAndGroupBuy(userId: string, groupbuyId: string): Promise<Participation | null>;
  findConfirmedByGroupBuy(groupbuyId: string): Promise<Participation[]>;
  updateStatus(id: string, status: ParticipationStatus): Promise<void>;
  cancelAllByGroupBuy(groupbuyId: string): Promise<void>;
}

export class InMemoryParticipationRepository implements ParticipationRepository {
  private readonly store = new Map<string, Participation>();

  async create(participation: Participation): Promise<Participation> {
    this.store.set(participation.id, { ...participation });
    return { ...participation };
  }

  async findByUserAndGroupBuy(userId: string, groupbuyId: string): Promise<Participation | null> {
    for (const p of this.store.values()) {
      if (p.userId === userId && p.groupbuyId === groupbuyId) {
        return { ...p };
      }
    }
    return null;
  }

  async findConfirmedByGroupBuy(groupbuyId: string): Promise<Participation[]> {
    const results: Participation[] = [];
    for (const p of this.store.values()) {
      if (p.groupbuyId === groupbuyId && p.status === 'confirmed') {
        results.push({ ...p });
      }
    }
    return results;
  }

  async updateStatus(id: string, status: ParticipationStatus): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.status = status;
      item.updatedAt = new Date();
    }
  }

  async cancelAllByGroupBuy(groupbuyId: string): Promise<void> {
    for (const p of this.store.values()) {
      if (p.groupbuyId === groupbuyId && p.status !== 'cancelled') {
        p.status = 'cancelled';
        p.updatedAt = new Date();
      }
    }
  }
}
