export type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type UserPromptHistory = {
  id: string;
  userId: string;
  promptText: string;
  normalizedQuery: Record<string, unknown>;
  createdAt: string;
};
