// 만들기 폼 임시저장(project_drafts). 본인 것만 조회/수정 — 022_create_extras.
export interface ProjectDraft {
  id: string;
  userId: string;
  title: string | null;
  data: Record<string, unknown>; // 만들기 폼 상태 통째 (JSONB)
  createdAt: Date;
  updatedAt: Date;
}
