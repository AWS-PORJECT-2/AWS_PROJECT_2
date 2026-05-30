export type CommentTargetType = 'fund' | 'profile';

/** 펀딩/프로필 대상 댓글. 대댓글은 parentId 로 구분. */
export interface Comment {
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  userId: string;
  userName: string;
  userPicture: string | null;
  userSlug: string | null;
  content: string;
  parentId: string | null;
  createdAt: Date;
}
