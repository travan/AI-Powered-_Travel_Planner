import { query } from "./postgres.js";

export type SearchDraft = {
  id: string;
  user_id: string | null;
  guest_key: string | null;
  email_hint: string | null;
  prompt_text: string | null;
  search_payload: Record<string, unknown>;
  status: "pending" | "claimed" | "discarded";
  created_at: string;
};

export async function createSearchDraft(input: {
  guestKey: string;
  emailHint?: string;
  promptText?: string;
  searchPayload: Record<string, unknown>;
}): Promise<SearchDraft> {
  const result = await query<SearchDraft>(
    `insert into search_drafts (guest_key, email_hint, prompt_text, search_payload, status)
     values ($1, $2, $3, $4, 'pending')
     returning id::text, user_id::text, guest_key, email_hint::text, prompt_text,
       search_payload, status, created_at::text`,
    [
      input.guestKey,
      input.emailHint ?? null,
      input.promptText ?? null,
      input.searchPayload,
    ]
  );

  return result.rows[0]!;
}

export async function claimSearchDraft(input: {
  draftId: string;
  guestKey: string;
  userId: string;
}): Promise<SearchDraft | null> {
  const result = await query<SearchDraft>(
    `update search_drafts
     set user_id = $3, status = 'claimed', restored_at = now(), updated_at = now()
     where id = $1
       and guest_key = $2
       and status = 'pending'
       and expires_at > now()
     returning id::text, user_id::text, guest_key, email_hint::text, prompt_text,
       search_payload, status, created_at::text`,
    [input.draftId, input.guestKey, input.userId]
  );

  return result.rows[0] ?? null;
}
