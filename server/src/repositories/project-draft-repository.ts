import type { ProjectDraft } from '../types/index.js';

// 목록 표시용 요약 — data 통째 대신 가벼운 메타 + 일부 요약(category 등)만.
export interface ProjectDraftSummary {
  id: string;
  title: string | null;
  category: string | null; // data.category 요약(있으면)
  updatedAt: Date;
}

export interface ProjectDraftRepository {
  // 본인 임시저장 목록(최신순) — 요약만.
  listByUser(userId: string): Promise<ProjectDraftSummary[]>;
  // 본인 것만 단건 조회(아니면 null).
  findByIdForUser(id: string, userId: string): Promise<ProjectDraft | null>;
  // 생성.
  create(userId: string, title: string | null, data: Record<string, unknown>): Promise<ProjectDraft>;
  // 본인 것만 갱신(아니면 null).
  updateForUser(id: string, userId: string, title: string | null | undefined, data: Record<string, unknown>): Promise<ProjectDraft | null>;
  // 본인 것만 삭제 — 삭제 성공 여부.
  deleteForUser(id: string, userId: string): Promise<boolean>;
}
