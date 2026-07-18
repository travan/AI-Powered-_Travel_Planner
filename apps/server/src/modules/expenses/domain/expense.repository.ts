import type { TripMember } from "../../trips/domain/trip.entity.js";
import type { Expense, ExpenseSplit } from "./expense.entity.js";

export const EXPENSE_REPOSITORY = Symbol("EXPENSE_REPOSITORY");

export type ExpenseDraft = {
  tripId: string;
  activityId?: string | null;
  billUploadId?: string | null;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  paidByUserId: string;
  createdByUserId: string;
  status: string;
};

export type ExpenseSplitDraft = {
  activityId?: string | null;
  userId: string;
  amount: number;
};

export type ExpensePatch = Partial<Omit<ExpenseDraft, "tripId" | "createdByUserId">> & {
  updatedByUserId: string;
};

export type ExpenseRepository = {
  findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null>;
  listActiveTripMembers(tripId: string): Promise<TripMember[]>;
  listForTrip(tripId: string): Promise<Expense[]>;
  findForTrip(input: { tripId: string; expenseId: string }): Promise<Expense | null>;
  create(input: { expense: ExpenseDraft; splits: ExpenseSplitDraft[] }): Promise<Expense>;
  update(input: { tripId: string; expenseId: string; patch: ExpensePatch; splits?: ExpenseSplitDraft[] }): Promise<Expense | null>;
  updateSplitStatus(input: {
    tripId: string;
    expenseId: string;
    splitId: string;
    status: ExpenseSplit["status"];
  }): Promise<ExpenseSplit | null>;
  audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void>;
};
