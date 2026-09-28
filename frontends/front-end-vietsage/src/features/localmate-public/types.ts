export type PublicLocalMateSuggestion = {
  label: string;
  query: string;
};

export type PublicLocalMateReply = {
  status: number;
  reply: string;
  suggestions: PublicLocalMateSuggestion[];
  action: null;
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
