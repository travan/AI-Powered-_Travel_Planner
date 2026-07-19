import { describe, expect, it, vi } from "vitest";
import { ExpensesService } from "../../../../../../apps/server/src/modules/expenses/application/expenses.service.js";
import type { Expense } from "../../../../../../apps/server/src/modules/expenses/domain/expense.entity.js";
import type { ExpenseRepository } from "../../../../../../apps/server/src/modules/expenses/domain/expense.repository.js";

const tripId = "trip-1";
const expenseId = "expense-1";
const now = new Date("2026-08-01T10:00:00.000Z").toISOString();

function buildMember(userId: string, role: "host" | "admin" | "editor" | "viewer" = "viewer") {
  return {
    tripId,
    userId,
    role,
    status: "active" as const,
    invitedByUserId: null,
    joinedAt: now,
  };
}

function buildExpense(): Expense {
  return {
    id: expenseId,
    tripId,
    activityId: "activity-1",
    billUploadId: "bill-1",
    title: "Lantern workshop bill",
    description: null,
    amount: 600000,
    currency: "VND",
    paidByUserId: "host-1",
    createdByUserId: "host-1",
    updatedByUserId: null,
    status: "approved",
    createdAt: now,
    updatedAt: now,
    splits: [
      {
        id: "split-host",
        expenseId,
        activityId: "activity-1",
        userId: "host-1",
        amount: 300000,
        status: "owed",
        settledAt: null,
      },
      {
        id: "split-viewer",
        expenseId,
        activityId: "activity-1",
        userId: "viewer-1",
        amount: 300000,
        status: "owed",
        settledAt: null,
      },
    ],
  };
}

function buildRepository(overrides: Partial<ExpenseRepository> = {}): ExpenseRepository {
  const expense = buildExpense();
  return {
    findTripMember: vi.fn().mockResolvedValue(buildMember("viewer-1")),
    listActiveTripMembers: vi.fn().mockResolvedValue([buildMember("host-1", "host"), buildMember("viewer-1")]),
    listForTrip: vi.fn().mockResolvedValue([expense]),
    findForTrip: vi.fn().mockResolvedValue(expense),
    create: vi.fn(),
    update: vi.fn(),
    updateSplitStatus: vi.fn().mockResolvedValue({
      ...expense.splits[1],
      status: "settled",
      settledAt: now,
    }),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ExpensesService", () => {
  it("blocks a viewer from updating another member's split", async () => {
    const repository = buildRepository();
    const service = new ExpensesService(repository);

    const result = await service.updateSplitStatus({
      tripId,
      expenseId,
      splitId: "split-host",
      actorUserId: "viewer-1",
      dto: { status: "settled" },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "expense_split_update_forbidden" },
    });
    expect(repository.updateSplitStatus).not.toHaveBeenCalled();
    expect(repository.audit).not.toHaveBeenCalled();
  });

  it("lets the split owner settle their own split", async () => {
    const repository = buildRepository();
    const service = new ExpensesService(repository);

    const result = await service.updateSplitStatus({
      tripId,
      expenseId,
      splitId: "split-viewer",
      actorUserId: "viewer-1",
      dto: { status: "settled" },
    });

    expect(result).toMatchObject({ ok: true, value: { id: "split-viewer", status: "settled" } });
    expect(repository.updateSplitStatus).toHaveBeenCalledWith({
      tripId,
      expenseId,
      splitId: "split-viewer",
      status: "settled",
    });
    expect(repository.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "status_settled" }));
  });

  it("lets a host update a member split for transparent administration", async () => {
    const repository = buildRepository({
      findTripMember: vi.fn().mockResolvedValue(buildMember("host-1", "host")),
    });
    const service = new ExpensesService(repository);

    const result = await service.updateSplitStatus({
      tripId,
      expenseId,
      splitId: "split-viewer",
      actorUserId: "host-1",
      dto: { status: "waived" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(repository.updateSplitStatus).toHaveBeenCalledWith({
      tripId,
      expenseId,
      splitId: "split-viewer",
      status: "waived",
    });
  });
});
