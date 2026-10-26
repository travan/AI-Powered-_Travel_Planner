import type { SqlClient } from "../../../database/database.tokens.js";
import type { UserPromptHistoryRepository } from "../domain/user-profile.repository.js";
import type { UserPromptHistory } from "../domain/user-profile.entity.js";

export class PostgresUserPromptHistoryRepository implements UserPromptHistoryRepository {
  constructor(private readonly sql: SqlClient) {}

  async listForUser(input: { userId: string; limit: number }): Promise<UserPromptHistory[]> {
    const result = await this.sql.query<{
      id: string; user_id: string; prompt_text: string;
      normalized_query: Record<string, unknown>; created_at: string;
    }>(`select id::text, user_id::text, prompt_text, normalized_query, created_at::text
        from user_prompt_history where user_id = $1 order by created_at desc limit $2`,
      [input.userId, input.limit]);
    return result.rows.map(row => ({ id: row.id, userId: row.user_id,
      promptText: row.prompt_text, normalizedQuery: row.normalized_query, createdAt: row.created_at }));
  }
}
