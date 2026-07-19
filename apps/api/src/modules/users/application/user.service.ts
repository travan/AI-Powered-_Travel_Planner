import { getPromptHistory } from "../../../db/prompt-history-store.js";

export class UserService {
  getPromptHistory(userId: string, limit: number) {
    return getPromptHistory(userId, limit);
  }
}

export const userService = new UserService();
