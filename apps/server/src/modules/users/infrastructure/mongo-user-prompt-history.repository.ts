import { Inject, Injectable } from "@nestjs/common";
import type { Db, Document, WithId } from "mongodb";
import { MONGO_DATABASE } from "../../../database/database.tokens.js";
import type { UserPromptHistory } from "../domain/user-profile.entity.js";
import type { UserPromptHistoryRepository } from "../domain/user-profile.repository.js";

type PromptHistoryDocument = Document & {
  userId?: string;
  user_id?: string;
  promptText?: string;
  prompt_text?: string;
  normalizedQuery?: Record<string, unknown>;
  normalized_query?: Record<string, unknown>;
  createdAt?: Date | string;
  created_at?: Date | string;
};

@Injectable()
export class MongoUserPromptHistoryRepository implements UserPromptHistoryRepository {
  constructor(@Inject(MONGO_DATABASE) private readonly db: Db) {}

  async listForUser(input: { userId: string; limit: number }): Promise<UserPromptHistory[]> {
    const documents = await this.db
      .collection<PromptHistoryDocument>("user_prompt_history")
      .find({ user_id: input.userId })
      .sort({ created_at: -1 })
      .limit(input.limit)
      .toArray();

    return documents.map(mapPromptHistory);
  }
}

function mapPromptHistory(document: WithId<PromptHistoryDocument>): UserPromptHistory {
  const rawCreatedAt = document.createdAt ?? document.created_at;
  const createdAt = rawCreatedAt instanceof Date ? rawCreatedAt.toISOString() : rawCreatedAt;

  return {
    id: document._id.toString(),
    userId: document.userId ?? document.user_id ?? "",
    promptText: document.promptText ?? document.prompt_text ?? "",
    normalizedQuery: document.normalizedQuery ?? document.normalized_query ?? {},
    createdAt: createdAt ?? "",
  };
}
