const CANDIDATE_KEY_PATTERN = /^cand_[A-Za-z0-9][A-Za-z0-9_-]{0,74}$/;

export type PublicChatBookingAction = {
  type: "LOCALMATE_BOOKING";
  candidateKey: string;
};

export function parsePublicChatAction(value: unknown): PublicChatBookingAction | null {
  if (typeof value !== "object" || value === null) return null;
  const action = value as Partial<PublicChatBookingAction>;
  if (
    action.type !== "LOCALMATE_BOOKING" ||
    typeof action.candidateKey !== "string" ||
    !CANDIDATE_KEY_PATTERN.test(action.candidateKey)
  ) {
    return null;
  }
  return { type: action.type, candidateKey: action.candidateKey };
}
