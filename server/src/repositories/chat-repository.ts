import type { ChatRoom, ChatMessage, ChatSenderRole } from '../types/chat.js';

export interface ChatRepository {
  findOrCreateRoom(userId: string): Promise<ChatRoom>;
  findRoomByUserId(userId: string): Promise<ChatRoom | null>;
  findRoomById(roomId: string): Promise<ChatRoom | null>;
  listRooms(limit: number, offset: number): Promise<{ items: ChatRoom[]; total: number }>;
  getMessages(roomId: string, limit: number, offset: number): Promise<ChatMessage[]>;
  createMessage(roomId: string, senderId: string, senderRole: ChatSenderRole, message: string): Promise<ChatMessage>;
  markAsRead(roomId: string, readerRole: ChatSenderRole): Promise<void>;
}
