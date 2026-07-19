export type SearchDraft = {
  id: string;
  userId: string | null;
  guestKey: string;
  emailHint: string | null;
  promptText: string;
  searchPayload: Record<string, unknown>;
  status: string;
  createdAt: string;
};
