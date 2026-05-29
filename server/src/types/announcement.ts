export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string | null;
  authorName: string | null;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementListItem {
  id: string;
  title: string;
  authorName: string | null;
  viewCount: number;
  createdAt: Date;
}
