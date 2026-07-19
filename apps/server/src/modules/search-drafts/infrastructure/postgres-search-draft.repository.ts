import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { SearchDraft } from "../domain/search-draft.entity.js";
import type { CreateSearchDraftInput, SearchDraftRepository } from "../domain/search-draft.repository.js";

type SearchDraftRow = {
  id: string;
  user_id: string | null;
  guest_key: string;
  email_hint: string | null;
  prompt_text: string;
  search_payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

@Injectable()
export class PostgresSearchDraftRepository implements SearchDraftRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async create(input: CreateSearchDraftInput): Promise<SearchDraft> {
    const result = await this.sql.query<SearchDraftRow>(
      `insert into search_drafts (guest_key, email_hint, prompt_text, search_payload)
       values ($1, $2, $3, $4)
       returning id::text, user_id::text, guest_key, email_hint, prompt_text, search_payload, status, created_at::text`,
      [input.guestKey, input.emailHint ?? null, input.promptText, input.searchPayload]
    );
    return mapSearchDraft(result.rows[0]!);
  }

  async claim(input: { draftId: string; guestKey: string; userId: string }): Promise<SearchDraft | null> {
    const result = await this.sql.query<SearchDraftRow>(
      `update search_drafts
       set user_id = $3, status = 'claimed'
       where id = $1 and guest_key = $2 and status = 'pending'
       returning id::text, user_id::text, guest_key, email_hint, prompt_text, search_payload, status, created_at::text`,
      [input.draftId, input.guestKey, input.userId]
    );
    return result.rows[0] ? mapSearchDraft(result.rows[0]) : null;
  }
}

function mapSearchDraft(row: SearchDraftRow): SearchDraft {
  return {
    id: row.id,
    userId: row.user_id,
    guestKey: row.guest_key,
    emailHint: row.email_hint,
    promptText: row.prompt_text,
    searchPayload: row.search_payload,
    status: row.status,
    createdAt: row.created_at,
  };
}
