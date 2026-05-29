export type ChatSenderRole = 'USER' | 'ADMIN';

export interface ChatRoom {
  id: string;
  userId: string;
  userName: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadAdminCount: number;
  unreadUserCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  message: string;
  isRead: boolean;
  createdAt: Date;
}
