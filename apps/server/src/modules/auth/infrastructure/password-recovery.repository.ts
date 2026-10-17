import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { POSTGRES_POOL } from "../../../database/database.tokens.js";
import { hashPassword } from "./postgres-user.repository.js";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

@Injectable()
export class PasswordRecoveryRepository {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async issue(email: string): Promise<string | null> {
    const token = randomBytes(32).toString("hex");
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      // Serialize issuance and redemption for this user, including concurrent requests.
      const user = await db.query(
        "select id from users where email = $1 and provider = 'local' for update",
        [email],
      );
      if (!user.rows[0]) {
        await db.query("commit");
        return null;
      }
      const userId = user.rows[0].id;
      const recent = await db.query(
        "select 1 from private.password_resets where user_id = $1 and created_at > now() - interval '1 minute'",
        [userId],
      );
      if (recent.rows.length) {
        await db.query("commit");
        return null;
      }
      await db.query("delete from private.password_resets where user_id = $1", [
        userId,
      ]);
      await db.query(
        "insert into private.password_resets(user_id, token_hash, expires_at) values ($1, $2, now() + interval '30 minutes')",
        [userId, digest(token)],
      );
      await db.query("commit");
      return token;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }

  async discard(token: string) {
    await this.pool.query(
      "delete from private.password_resets where token_hash = $1",
      [digest(token)],
    );
  }

  async reset(token: string, password: string): Promise<boolean> {
    const passwordHash = await hashPassword(password);
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      const result = await db.query(
        `select u.id from users u join private.password_resets r on r.user_id = u.id
        where r.token_hash = $1 and r.expires_at > now() and u.provider = 'local' for update of u`,
        [digest(token)],
      );
      const userId = result.rows[0]?.id;
      if (!userId) {
        await db.query("rollback");
        return false;
      }
      // Recheck after acquiring the user lock: another redemption may have consumed it.
      const consumed = await db.query(
        "delete from private.password_resets where user_id = $1 and token_hash = $2 and expires_at > now() returning user_id",
        [userId, digest(token)],
      );
      if (!consumed.rows.length) {
        await db.query("rollback");
        return false;
      }
      await db.query(
        "update users set password_hash = $1, updated_at = now() where id = $2",
        [passwordHash, userId],
      );
      await db.query(
        "update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
        [userId],
      );
      await db.query("commit");
      return true;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
}
