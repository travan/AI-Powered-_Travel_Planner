import type { UserProfile, UserPromptHistory } from "./user-profile.entity.js";

export const USER_PROFILE_REPOSITORY = Symbol("USER_PROFILE_REPOSITORY");
export const USER_PROMPT_HISTORY_REPOSITORY = Symbol("USER_PROMPT_HISTORY_REPOSITORY");

export type UserProfileRepository = {
  findById(userId: string): Promise<UserProfile | null>;
};

export type UserPromptHistoryRepository = {
  listForUser(input: { userId: string; limit: number }): Promise<UserPromptHistory[]>;
};
