export type PublicLocalMateSuggestion = {
  label: string;
  query: string;
};

export type PublicLocalMateSelection = {
  proposalKey?: string;
  candidateKey?: string;
};

export type PublicLocalMateStage =
  | "DISCOVERY"
  | "PROPOSALS"
  | "GUIDE_SELECTION"
  | "BOOKING";

export type PublicLocalMateProposal = {
  proposalKey: string;
  title: string;
  location: string;
  duration: string;
  highlights: string[];
  bookable: boolean;
  availableGuideCount: number;
  selected?: boolean;
};

export type PublicLocalMateActionType =
  | "SELECT_PROPOSAL"
  | "REFINE_PROPOSAL"
  | "SHOW_ALTERNATIVES"
  | "SELECT_GUIDE"
  | "LOCALMATE_BOOKING";

export type PublicLocalMateAction = {
  type: PublicLocalMateActionType;
  label?: string;
  candidateKey?: string;
  proposalKey?: string;
  guideName?: string;
  guideCode?: string;
};

export type PublicLocalMateReply = {
  status: number;
  reply: string;
  suggestions: PublicLocalMateSuggestion[];
  action: PublicLocalMateAction | null;
  stage?: PublicLocalMateStage;
  proposals?: PublicLocalMateProposal[];
  actions?: PublicLocalMateAction[];
  availableGuides?: Array<{
    candidateKey: string;
    guideName: string;
    rating?: number;
    specialties?: string[];
    price?: number;
  }>;
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
  selection?: PublicLocalMateSelection;
  actionType?: PublicLocalMateActionType;
};

export function canProceedToBooking(selection: {
  proposalKey?: string | null;
  candidateKey?: string | null;
}): boolean {
  return Boolean(selection.proposalKey && selection.candidateKey);
}

export function validateBookingPrerequisites(selection: {
  proposalKey?: string | null;
  candidateKey?: string | null;
}): { ok: boolean; error?: string } {
  if (!selection.proposalKey && !selection.candidateKey) {
    return {
      ok: false,
      error: "Cần chọn cả lịch trình và hướng dẫn viên trước khi đặt tour.",
    };
  }
  if (!selection.proposalKey) {
    return {
      ok: false,
      error: "Vui lòng chọn lịch trình trước khi tiến hành đặt tour.",
    };
  }
  if (!selection.candidateKey) {
    return {
      ok: false,
      error: "Vui lòng chọn hướng dẫn viên trước khi tiến hành đặt tour.",
    };
  }
  return { ok: true };
}

export function transitionStage(
  currentStage: PublicLocalMateStage,
  action: PublicLocalMateActionType,
): PublicLocalMateStage {
  switch (action) {
    case "SHOW_ALTERNATIVES":
    case "REFINE_PROPOSAL":
      return "DISCOVERY";
    case "SELECT_PROPOSAL":
      return "GUIDE_SELECTION";
    case "SELECT_GUIDE":
      return "BOOKING";
    default:
      return currentStage;
  }
}

export function resetSelectionOnLocationChange(): {
  proposalKey: null;
  candidateKey: null;
  stage: PublicLocalMateStage;
} {
  return {
    proposalKey: null,
    candidateKey: null,
    stage: "DISCOVERY",
  };
}

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
  proposalKey: string;
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
