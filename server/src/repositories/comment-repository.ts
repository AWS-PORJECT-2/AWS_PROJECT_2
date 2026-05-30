import type { Comment, CommentTargetType } from '../types/index.js';

export interface CommentRepository {
  /** 대상의 댓글 최신순. parentId 로 대댓글 구분(프론트가 트리 구성). */
  list(targetType: CommentTargetType, targetId: string): Promise<Comment[]>;
  create(input: {
    targetType: CommentTargetType;
    targetId: string;
    userId: string;
    content: string;
    parentId: string | null;
  }): Promise<Comment>;
  findById(id: string): Promise<Comment | null>;
  /** 작성자 본인만 삭제 — 삭제된 행 수 반환(권한 검증은 상위에서). */
  delete(id: string): Promise<void>;
}
