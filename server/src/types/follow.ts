/** 팔로우 관계 한 건. creator = 팔로우 당하는 대상(메이커). */
export interface Follow {
  followerId: string;
  creatorId: string;
  createdAt: Date;
}

/** 팔로워/팔로잉 목록 표시용 한 줄. */
export interface FollowUser {
  userId: string;
  name: string;
  nickname: string | null;
  slug: string | null;
  picture: string | null;
  isFollowing: boolean;
}
