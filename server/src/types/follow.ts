/** 팔로워/팔로잉 목록 표시용 한 줄. */
export interface FollowUser {
  userId: string;
  name: string;
  nickname: string | null;
  slug: string | null;
  picture: string | null;
  isFollowing: boolean;
}
