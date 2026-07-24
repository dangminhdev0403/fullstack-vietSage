export type HotelMessage = { id: string; senderType: "GUEST" | "STAFF" | "SYSTEM"; senderName: string | null; body: string; createdAt: string; readAt?: string | null };
export type HotelMessageThread = { id: string; stayId: string; status: string; roomNumber: string; floor: string | null; roomType: string | null; guestName: string; lastMessageAt: string; unreadCount: number; latestMessage: HotelMessage | null };
export type HotelMessageThreadList = { items: HotelMessageThread[]; total: number; nextCursor?: string | null; hasMore?: boolean };
export type HotelMessageThreadPage = { thread: HotelMessageThread; items: HotelMessage[]; nextCursor?: string | null; hasMore?: boolean };
