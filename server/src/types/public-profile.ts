/** 공개 프로필 응답 — GET /api/users/:idOrSlug */
export interface ProfileBadge {
  key: string;
  label: string;
  desc: string;
}

export interface PublicProfile {
  userId: string;
  name: string;
  nickname: string | null;
  slug: string | null;
  intro: string | null;
  website: string | null;
  picture: string | null;
  coverUrl: string | null;
  themeColor: string | null;
  followerCount: number;
  followingCount: number;
  supporterCount: number;
  projectCount: number;
  isFollowing: boolean;
  isMe: boolean;
  badges: ProfileBadge[];
}

/** 유저 검색 결과 한 줄 — GET /api/users/search */
export interface UserSearchItem {
  userId: string;
  name: string;
  nickname: string | null;
  slug: string | null;
  picture: string | null;
  isFollowing: boolean;   // viewer 가 이 사용자를 팔로우 중인지(비로그인/미팔로우=false) — 검색결과 팔로우버튼 상태
}
