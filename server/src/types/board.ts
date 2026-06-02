import type { BoardMedia } from '../utils/board-content.js';

export interface BoardAuthor {
  id: string;
  name: string | null;
  nickname: string | null;
  picture: string | null;
  slug: string | null;
}

export interface BoardPost {
  id: string;
  category: string;
  title: string;
  body: string;
  thumbnail: string | null;
  contentBlocks: unknown[];
  media: BoardMedia[];
  commentCount: number;
  author: BoardAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface BoardComment {
  id: string;
  postId: string;
  body: string;
  author: BoardAuthor;
  createdAt: string;
}
