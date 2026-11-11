import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../database/database.tokens.js";
import {
  CurrentUser,
  type CurrentUserValue,
} from "../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../shared/nest/jwt-auth.guard.js";

const visible = `n.recipient_id=$1 and (
  n.access_scope='recipient' or (n.trip_id is null and n.category in ('generate','translate','revision'))
  or exists (
    select 1 from trip_members m where m.trip_id=n.trip_id and m.user_id=$1 and m.status='active'
    and (n.access_scope='member' or (n.access_scope='finance' and m.role in ('host','co_host','contributor'))
         or (n.access_scope='manager' and m.role in ('host','co_host')))
  )
)`;

@Controller("api/notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  @Get("unread")
  @Header("Cache-Control", "private, no-store")
  async unread(@CurrentUser() user: CurrentUserValue) {
    const result = await this.sql.query<{ count: number }>(
      `select count(*)::int as count from product_notifications n where n.read_at is null and ${visible}`,
      [user.sub],
    );
    return { count: result.rows[0]?.count ?? 0 };
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @CurrentUser() user: CurrentUserValue,
    @Query("before", new ParseUUIDPipe({ optional: true })) before?: string,
  ) {
    const result = await this.sql.query<{
      id: string;
      subject_id: string;
      trip_id: string | null;
      category: string;
      event: string;
      attempt: number | null;
      created_at: string;
      read_at: string | null;
    }>(
      `select n.id::text,n.subject_id::text,n.trip_id::text,n.category,n.event,n.attempt,n.created_at,n.read_at
       from product_notifications n where ${visible} and (
         $2::uuid is null or (n.created_at,n.id) < (
           select c.created_at,c.id from product_notifications c where c.id=$2 and c.recipient_id=$1
         )
       ) order by n.created_at desc,n.id desc limit 26`,
      [user.sub, before ?? null],
    );
    return {
      items: result.rows.slice(0, 25),
      next: result.rows.length > 25 ? result.rows[24]!.id : null,
    };
  }

  @Patch(":id/read")
  @Header("Cache-Control", "private, no-store")
  async read(
    @CurrentUser() user: CurrentUserValue,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const result = await this.sql.query(
      `update product_notifications n set read_at=coalesce(n.read_at,now())
       where n.id=$2 and ${visible} returning n.id`,
      [user.sub, id],
    );
    if (!result.rows.length)
      throw new NotFoundException("Notification not found.");
    return { read: true };
  }
}
