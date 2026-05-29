import type { Announcement, AnnouncementListItem } from '../types/index.js';

export interface AnnouncementRepository {
  findById(id: string): Promise<Announcement | null>;
  list(limit: number, offset: number): Promise<{ items: AnnouncementListItem[]; total: number }>;
  create(authorId: string, title: string, content: string): Promise<Announcement>;
  update(id: string, title: string, content: string): Promise<Announcement | null>;
  delete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
}
