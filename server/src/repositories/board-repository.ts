import type { BoardPost, BoardComment } from '../types/board.js';
import type { BoardMedia } from '../utils/board-content.js';

export interface BoardListOptions {
  category?: string;     // 미지정 = 전체
  limit: number;
  before?: string;       // created_at ISO — 이 시각 이전(커서 페이지네이션)
}

export interface BoardRepository {
  listPosts(opts: BoardListOptions): Promise<BoardPost[]>;
  getPost(id: string): Promise<BoardPost | null>;
  createPost(input: { authorId: string; category: string; title: string; body: string; media: BoardMedia[] }): Promise<BoardPost>;
  /** 작성자 id 반환(소유 확인용). 없으면 null. */
  getPostAuthorId(id: string): Promise<string | null>;
  deletePost(id: string): Promise<boolean>;

  listComments(postId: string): Promise<BoardComment[]>;
  createComment(input: { postId: string; authorId: string; body: string }): Promise<BoardComment | null>;
  getCommentAuthorId(id: string): Promise<string | null>;
  deleteComment(id: string): Promise<boolean>;
}
