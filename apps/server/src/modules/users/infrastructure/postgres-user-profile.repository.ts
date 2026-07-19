import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { UserProfile } from "../domain/user-profile.entity.js";
import type { UserProfileRepository } from "../domain/user-profile.repository.js";

type UserProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

@Injectable()
export class PostgresUserProfileRepository implements UserProfileRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async findById(userId: string): Promise<UserProfile | null> {
    const result = await this.sql.query<UserProfileRow>(
      `select id::text, email, display_name, avatar_url, created_at::text
       from users
       where id = $1
       limit 1`,
      [userId]
    );
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  }
}

function mapProfile(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}
