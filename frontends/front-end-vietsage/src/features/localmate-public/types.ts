export type PublicLocalMateSuggestion = {
  label: string;
  query: string;
};

export type PublicLocalMateReply = {
  status: number;
  reply: string;
  suggestions: PublicLocalMateSuggestion[];
  action: { type: "LOCALMATE_BOOKING"; candidateKey: string } | null;
  knowledgeVersion: string;
  cached: boolean;
};

export type PublicLocalMateHistoryEntry = {
  role: "guest" | "localmate";
  text: string;
};

export type PublicLocalMateChatInput = {
  message: string;
  location?: string;
  language: "vi";
  history?: PublicLocalMateHistoryEntry[];
};

export type CreatePublicSessionInput = {
  location: string;
  guestDisplayName?: string | null;
  guestPhone?: string | null;
};

export type PublicLocalMateSession = {
  sessionId: string;
  expiresAt: string;
};

export type PublicBookingCandidate = {
  candidateKey: string;
  guide: {
    id: string;
    guideCode: string;
    fullName: string;
    avatarUrl?: string | null;
    languages: string[];
    specialties: string[];
    rating: number;
    totalReviews: number;
  };
  service: {
    id: string;
    code: string;
    name: string;
    price: number;
    currency: string;
    unit: string;
    minDurationHours: number;
  };
  telegramReady: boolean;
};

export type CreatePublicOrderInput = {
  candidateKey: string;
  quantity?: number;
  requestedStartAt?: string | null;
  partySize?: number | null;
  guestNote?: string | null;
  idempotencyKey: string;
};

export type PublicOrderPayment = {
  id: string;
  status: "CREATING" | "OPEN" | "PAID" | "NOT_REQUIRED" | "CANCELLED" | "REFUNDED" | string;
  currency: string;
  tourTotalAmount?: string | number | null;
  platformFeeAmount?: string | number | null;
  guideRemainingAmount?: string | number | null;
  checkoutUrl?: string | null;
  expiresAt?: string | null;
};

export type PublicOrder = {
  id: string;
  orderNumber: string;
  status: "PENDING" | "ACKNOWLEDGED" | "COMPLETED" | "CANCELLED" | "REJECTED";
  quantity: number;
  partnerSubtotal: string | number;
  hotelServiceFeeAmount: string | number;
  customerTotalAmount: string | number;
  totalAmount: string | number;
  currency: string;
  serviceNameSnapshot: string;
  requestedStartAt?: string | null;
  guestNote?: string | null;
  payment?: PublicOrderPayment | null;
  serviceTenant?: { serviceProfile?: { displayName?: string } } | null;
};

export type PublicConversationMessage = {
  id: string;
  orderId: string;
  senderType: "GUEST" | "LOCALMATE" | "SERVICE_STAFF";
  body: string;
  deliveryStatus: string;
  createdAt: string;
};

export type PublicConversation = {
  id: string;
  orderId: string;
  orderStatus: string;
  status: string;
  lastMessageAt?: string;
  items: PublicConversationMessage[];
};

export type SendPublicMessageInput = {
  body: string;
  clientMessageId: string;
};
