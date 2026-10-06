const PROPOSAL_KEY_PATTERN = /^(trip|prop)_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
const CANDIDATE_KEY_PATTERN = /^cand_[A-Za-z0-9][A-Za-z0-9_-]{0,74}$/;

export type PublicChatGuideAction = {
  type: "SELECT_GUIDE";
  proposalKey: string;
  candidateKey: string;
};

export function parsePublicChatAction(value: unknown): PublicChatGuideAction | null {
  if (typeof value !== "object" || value === null) return null;
  const action = value as Partial<PublicChatGuideAction>;
  if (
    action.type !== "SELECT_GUIDE" ||
    typeof action.proposalKey !== "string" ||
    !PROPOSAL_KEY_PATTERN.test(action.proposalKey) ||
    typeof action.candidateKey !== "string" ||
    !CANDIDATE_KEY_PATTERN.test(action.candidateKey)
  ) {
    return null;
  }
  return {
    type: action.type,
    proposalKey: action.proposalKey,
    candidateKey: action.candidateKey,
  };
}
