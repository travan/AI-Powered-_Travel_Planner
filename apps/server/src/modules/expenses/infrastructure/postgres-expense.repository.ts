import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { TripMember, TripMemberRole, TripMemberStatus } from "../../trips/domain/trip.entity.js";
import type { Expense, ExpenseSplit } from "../domain/expense.entity.js";
import type {
  ExpenseDraft,
  ExpensePatch,
  ExpenseRepository,
  ExpenseSplitDraft,
} from "../domain/expense.repository.js";

type TripMemberRow = {
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_by_user_id: string | null;
  joined_at: string;
};

type ExpenseRow = {
  id: string;
  trip_id: string;
  activity_id: string | null;
  bill_upload_id: string | null;
  title: string;
  description: string | null;
  amount: string | number;
  currency: string;
  paid_by_user_id: string;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ExpenseSplitRow = {
  id: string;
  expense_id: string;
  activity_id: string | null;
  user_id: string;
  amount: string | number;
  status: ExpenseSplit["status"];
  settled_at: string | null;
};

@Injectable()
export class PostgresExpenseRepository implements ExpenseRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null> {
    const result = await this.sql.query<TripMemberRow>(
      `select trip_id::text, user_id::text, role, status, invited_by_user_id::text, joined_at::text
       from trip_members
       where trip_id = $1 and user_id = $2
       limit 1`,
      [input.tripId, input.userId]
    );
    return result.rows[0] ? mapMember(result.rows[0]) : null;
  }

  async listActiveTripMembers(tripId: string): Promise<TripMember[]> {
    const result = await this.sql.query<TripMemberRow>(
      `select trip_id::text, user_id::text, role, status, invited_by_user_id::text, joined_at::text
       from trip_members
       where trip_id = $1 and status = 'active'
       order by joined_at asc`,
      [tripId]
    );
    return result.rows.map(mapMember);
  }

  async listForTrip(tripId: string): Promise<Expense[]> {
    const expenses = await this.sql.query<ExpenseRow>(
      `${expenseSelectSql}
       where e.trip_id = $1
       order by e.created_at desc`,
      [tripId]
    );
    return this.hydrateExpenses(expenses.rows);
  }

  async findForTrip(input: { tripId: string; expenseId: string }): Promise<Expense | null> {
    const expenses = await this.sql.query<ExpenseRow>(
      `${expenseSelectSql}
       where e.trip_id = $1 and e.id = $2
       limit 1`,
      [input.tripId, input.expenseId]
    );
    const [expense] = await this.hydrateExpenses(expenses.rows);
    return expense ?? null;
  }

  async create(input: { expense: ExpenseDraft; splits: ExpenseSplitDraft[] }): Promise<Expense> {
    const result = await this.sql.query<ExpenseRow>(
      `insert into expenses (
         trip_id, activity_id, bill_upload_id, title, description, amount, currency,
         paid_by_user_id, created_by_user_id, status
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id::text, trip_id::text, activity_id::text, bill_upload_id::text, title, description,
                 amount, currency, paid_by_user_id::text, created_by_user_id::text, updated_by_user_id::text,
                 status, created_at::text, updated_at::text`,
      [
        input.expense.tripId,
        input.expense.activityId ?? null,
        input.expense.billUploadId ?? null,
        input.expense.title,
        input.expense.description ?? null,
        input.expense.amount,
        input.expense.currency,
        input.expense.paidByUserId,
        input.expense.createdByUserId,
        input.expense.status,
      ]
    );
    const expense = mapExpense(result.rows[0]!);
    await this.replaceSplits(expense.id, input.splits);
    return (await this.findForTrip({ tripId: expense.tripId, expenseId: expense.id }))!;
  }

  async update(input: { tripId: string; expenseId: string; patch: ExpensePatch; splits?: ExpenseSplitDraft[] }): Promise<Expense | null> {
    const result = await this.sql.query<ExpenseRow>(
      `update expenses
       set title = coalesce($3, title),
           description = coalesce($4, description),
           amount = coalesce($5, amount),
           currency = coalesce($6, currency),
           paid_by_user_id = coalesce($7, paid_by_user_id),
           activity_id = coalesce($8, activity_id),
           bill_upload_id = coalesce($9, bill_upload_id),
           status = coalesce($10, status),
           updated_by_user_id = $11,
           updated_at = now()
       where trip_id = $1 and id = $2
       returning id::text, trip_id::text, activity_id::text, bill_upload_id::text, title, description,
                 amount, currency, paid_by_user_id::text, created_by_user_id::text, updated_by_user_id::text,
                 status, created_at::text, updated_at::text`,
      [
        input.tripId,
        input.expenseId,
        input.patch.title ?? null,
        input.patch.description ?? null,
        input.patch.amount ?? null,
        input.patch.currency ?? null,
        input.patch.paidByUserId ?? null,
        input.patch.activityId ?? null,
        input.patch.billUploadId ?? null,
        input.patch.status ?? null,
        input.patch.updatedByUserId,
      ]
    );
    if (!result.rows[0]) return null;
    if (input.splits) await this.replaceSplits(input.expenseId, input.splits);
    return this.findForTrip({ tripId: input.tripId, expenseId: input.expenseId });
  }

  async updateSplitStatus(input: {
    tripId: string;
    expenseId: string;
    splitId: string;
    status: ExpenseSplit["status"];
  }): Promise<ExpenseSplit | null> {
    const result = await this.sql.query<ExpenseSplitRow>(
      `update expense_splits s
       set status = $4,
           settled_at = case when $4 = 'settled' then now() else null end,
           updated_at = now()
       from expenses e
       where s.expense_id = e.id and e.trip_id = $1 and s.expense_id = $2 and s.id = $3
       returning s.id::text, s.expense_id::text, s.activity_id::text, s.user_id::text,
                 s.amount, s.status, s.settled_at::text`,
      [input.tripId, input.expenseId, input.splitId, input.status]
    );
    return result.rows[0] ? mapSplit(result.rows[0]) : null;
  }

  async audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.sql.query(
      `insert into audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, before_snapshot, after_snapshot)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.tripId,
        input.actorUserId,
        input.entityType,
        input.entityId ?? null,
        input.action,
        input.before ?? null,
        input.after ?? null,
      ]
    );
  }

  private async replaceSplits(expenseId: string, splits: ExpenseSplitDraft[]): Promise<void> {
    await this.sql.query(`delete from expense_splits where expense_id = $1`, [expenseId]);
    for (const split of splits) {
      await this.sql.query(
        `insert into expense_splits (expense_id, activity_id, user_id, amount)
         values ($1, $2, $3, $4)`,
        [expenseId, split.activityId ?? null, split.userId, split.amount]
      );
    }
  }

  private async hydrateExpenses(rows: ExpenseRow[]): Promise<Expense[]> {
    if (rows.length === 0) return [];
    const expenseIds = rows.map((row) => row.id);
    const splitResult = await this.sql.query<ExpenseSplitRow>(
      `select id::text, expense_id::text, activity_id::text, user_id::text, amount, status, settled_at::text
       from expense_splits
       where expense_id = any($1::uuid[])
       order by created_at asc`,
      [expenseIds]
    );
    const splitsByExpense = new Map<string, ExpenseSplit[]>();
    for (const row of splitResult.rows) {
      const splits = splitsByExpense.get(row.expense_id) ?? [];
      splits.push(mapSplit(row));
      splitsByExpense.set(row.expense_id, splits);
    }
    return rows.map((row) => ({
      ...mapExpense(row),
      splits: splitsByExpense.get(row.id) ?? [],
    }));
  }
}

const expenseSelectSql = `select e.id::text, e.trip_id::text, e.activity_id::text, e.bill_upload_id::text,
                                 e.title, e.description, e.amount, e.currency, e.paid_by_user_id::text,
                                 e.created_by_user_id::text, e.updated_by_user_id::text, e.status,
                                 e.created_at::text, e.updated_at::text
                          from expenses e`;

function mapMember(row: TripMemberRow): TripMember {
  return {
    tripId: row.trip_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    activityId: row.activity_id,
    billUploadId: row.bill_upload_id,
    title: row.title,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    paidByUserId: row.paid_by_user_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    splits: [],
  };
}

function mapSplit(row: ExpenseSplitRow): ExpenseSplit {
  return {
    id: row.id,
    expenseId: row.expense_id,
    activityId: row.activity_id,
    userId: row.user_id,
    amount: Number(row.amount),
    status: row.status,
    settledAt: row.settled_at,
  };
}
