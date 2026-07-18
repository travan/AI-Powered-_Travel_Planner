import { Inject, Injectable } from "@nestjs/common";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { UserProfile, UserPromptHistory } from "../domain/user-profile.entity.js";
import {
  USER_PROFILE_REPOSITORY,
  USER_PROMPT_HISTORY_REPOSITORY,
  type UserProfileRepository,
  type UserPromptHistoryRepository,
} from "../domain/user-profile.repository.js";

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_PROFILE_REPOSITORY)
    private readonly profiles: UserProfileRepository,
    @Inject(USER_PROMPT_HISTORY_REPOSITORY)
    private readonly promptHistory: UserPromptHistoryRepository
  ) {}

  async getProfile(userId: string): Promise<ServiceResult<UserProfile>> {
    const profile = await this.profiles.findById(userId);
    return profile ? ok(profile) : notFound("User profile not found");
  }

  listPromptHistory(input: { userId: string; limit: number }): Promise<UserPromptHistory[]> {
    return this.promptHistory.listForUser(input);
  }
}
