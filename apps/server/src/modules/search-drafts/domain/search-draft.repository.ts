import type { SearchDraft } from "./search-draft.entity.js";

export const SEARCH_DRAFT_REPOSITORY = Symbol("SEARCH_DRAFT_REPOSITORY");

export type CreateSearchDraftInput = {
  guestKey: string;
  emailHint?: string;
  promptText: string;
  searchPayload: Record<string, unknown>;
};

export interface SearchDraftRepository {
  create(input: CreateSearchDraftInput): Promise<SearchDraft>;
  claim(input: { draftId: string; guestKey: string; userId: string }): Promise<SearchDraft | null>;
}
