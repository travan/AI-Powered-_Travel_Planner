import { Inject, Injectable } from "@nestjs/common";
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import { getTripRolePermissions } from "../../../shared/application/trip-role-permissions.js";
import type { Expense, ExpenseSplit } from "../domain/expense.entity.js";
import {
  EXPENSE_REPOSITORY,
  type ExpenseRepository,
  type ExpenseSplitDraft,
} from "../domain/expense.repository.js";
import type {
  CreateExpenseDto,
  UpdateExpenseDto,
  UpdateExpenseSplitStatusDto,
} from "../dto/expense.dto.js";

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepository,
  ) {}

  async listForTrip(input: {
    tripId: string;
    actorUserId: string;
  }): Promise<ServiceResult<Expense[]>> {
    const member = await this.expenses.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).viewFinance) {
      return forbidden(
        "Viewers cannot access trip finances",
        "finance_view_forbidden",
      );
    }
    return ok(await this.expenses.listForTrip(input.tripId));
  }

  async create(input: {
    tripId: string;
    actorUserId: string;
    dto: CreateExpenseDto;
  }): Promise<ServiceResult<Expense>> {
    const member = await this.expenses.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).contribute) {
      return forbidden(
        "Viewers cannot create expenses",
        "expense_create_forbidden",
      );
    }

    const paidByUserId = input.dto.paid_by_user_id ?? input.actorUserId;
    if (!(await this.isActiveMember(input.tripId, paidByUserId))) {
      return badRequest(
        "Paid-by user must be an active trip member",
        "paid_by_not_member",
      );
    }

    const splitResult = await this.resolveSplits({
      tripId: input.tripId,
      amount: input.dto.amount,
      activityId: input.dto.activity_id,
      participantUserIds: input.dto.participant_user_ids,
      customSplits:
        input.dto.split_strategy === "custom"
          ? (input.dto.splits ?? [])
          : undefined,
    });
    if (!splitResult.ok) return splitResult;

    const expense = await this.expenses.create({
      expense: {
        tripId: input.tripId,
        activityId: input.dto.activity_id ?? null,
        billUploadId: input.dto.bill_upload_id ?? null,
        title: input.dto.title.trim(),
        expenseType: input.dto.expense_type ?? "other",
        description: input.dto.description?.trim() || null,
        amount: input.dto.amount,
        currency: input.dto.currency.toUpperCase(),
        paidByUserId,
        createdByUserId: input.actorUserId,
        status: "pending_review",
      },
      splits: splitResult.value,
    });
    await this.expenses.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "expense",
      entityId: expense.id,
      action: "created",
      after: expense,
    });
    return ok(expense);
  }

  async update(input: {
    tripId: string;
    expenseId: string;
    actorUserId: string;
    dto: UpdateExpenseDto;
  }): Promise<ServiceResult<Expense>> {
    const before = await this.expenses.findForTrip({
      tripId: input.tripId,
      expenseId: input.expenseId,
    });
    if (!before) return notFound("Expense not found");

    const member = await this.expenses.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).contribute) {
      return forbidden(
        "Viewers cannot edit expenses",
        "expense_edit_forbidden",
      );
    }
    if (
      before.createdByUserId !== input.actorUserId &&
      !["host", "co_host"].includes(member.role)
    ) {
      return forbidden(
        "Only host/co-host or the creator can edit this expense",
        "expense_edit_forbidden",
      );
    }
    if (
      input.dto.status !== undefined &&
      !getTripRolePermissions(member.role).reviewSubmissions
    ) {
      return forbidden(
        "Only host/co-host can change expense review status",
        "expense_status_forbidden",
      );
    }

    if (
      input.dto.paid_by_user_id &&
      !(await this.isActiveMember(input.tripId, input.dto.paid_by_user_id))
    ) {
      return badRequest(
        "Paid-by user must be an active trip member",
        "paid_by_not_member",
      );
    }

    let splits: ExpenseSplitDraft[] | undefined;
    if (input.dto.splits) {
      const splitResult = await this.resolveSplits({
        tripId: input.tripId,
        amount: input.dto.amount ?? before.amount,
        activityId: input.dto.activity_id ?? before.activityId,
        customSplits: input.dto.splits,
      });
      if (!splitResult.ok) return splitResult;
      splits = splitResult.value;
    }

    const updated = await this.expenses.update({
      tripId: input.tripId,
      expenseId: input.expenseId,
      patch: {
        title: input.dto.title?.trim(),
        expenseType: input.dto.expense_type,
        description: input.dto.description?.trim(),
        amount: input.dto.amount,
        currency: input.dto.currency?.toUpperCase(),
        paidByUserId: input.dto.paid_by_user_id,
        activityId: input.dto.activity_id,
        billUploadId: input.dto.bill_upload_id,
        status: input.dto.status,
        updatedByUserId: input.actorUserId,
      },
      splits,
    });
    if (!updated) return notFound("Expense not found");

    await this.expenses.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "expense",
      entityId: updated.id,
      action: "updated",
      before,
      after: updated,
    });
    return ok(updated);
  }

  async updateSplitStatus(input: {
    tripId: string;
    expenseId: string;
    splitId: string;
    actorUserId: string;
    dto: UpdateExpenseSplitStatusDto;
  }): Promise<ServiceResult<ExpenseSplit>> {
    const member = await this.expenses.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).viewFinance) {
      return forbidden(
        "Viewers cannot update expense splits",
        "expense_split_update_forbidden",
      );
    }

    const expense = await this.expenses.findForTrip({
      tripId: input.tripId,
      expenseId: input.expenseId,
    });
    const currentSplit = expense?.splits.find(
      (entry) => entry.id === input.splitId,
    );
    if (!currentSplit) return notFound("Expense split not found");
    if (
      currentSplit.userId !== input.actorUserId &&
      !["host", "co_host"].includes(member.role)
    ) {
      return forbidden(
        "Only host/co-host or the split owner can update this split",
        "expense_split_update_forbidden",
      );
    }

    const split = await this.expenses.updateSplitStatus({
      tripId: input.tripId,
      expenseId: input.expenseId,
      splitId: input.splitId,
      status: input.dto.status,
    });
    if (!split) return notFound("Expense split not found");
    await this.expenses.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "expense_split",
      entityId: split.id,
      action: `status_${input.dto.status}`,
      after: split,
    });
    return ok(split);
  }

  private async resolveSplits(input: {
    tripId: string;
    amount: number;
    activityId?: string | null;
    participantUserIds?: string[];
    customSplits?: Array<{ user_id: string; amount: number }>;
  }): Promise<ServiceResult<ExpenseSplitDraft[]>> {
    if (input.customSplits) {
      if (input.customSplits.length === 0) {
        return badRequest(
          "Custom split strategy requires at least one split",
          "custom_split_required",
        );
      }
      if (input.participantUserIds) {
        const selectedParticipants = new Set(input.participantUserIds);
        const splitParticipants = new Set(
          input.customSplits.map((split) => split.user_id),
        );
        if (
          selectedParticipants.size !== splitParticipants.size ||
          [...selectedParticipants].some(
            (userId) => !splitParticipants.has(userId),
          )
        ) {
          return badRequest(
            "Every selected participant needs a custom split amount",
            "custom_split_participant_mismatch",
          );
        }
      }
      const total = roundMoney(
        input.customSplits.reduce((sum, split) => sum + split.amount, 0),
      );
      if (Math.abs(total - roundMoney(input.amount)) > 0.01) {
        return badRequest(
          "Custom split total must equal expense amount",
          "split_total_mismatch",
        );
      }
      for (const split of input.customSplits) {
        if (!(await this.isActiveMember(input.tripId, split.user_id))) {
          return badRequest(
            "Every split user must be an active trip member",
            "split_user_not_member",
          );
        }
      }
      return ok(
        input.customSplits.map((split) => ({
          userId: split.user_id,
          amount: split.amount,
          activityId: input.activityId,
        })),
      );
    }

    const members = input.participantUserIds
      ? await Promise.all(
          input.participantUserIds.map((userId) =>
            this.expenses.findTripMember({
              tripId: input.tripId,
              userId,
            }),
          ),
        )
      : await this.expenses.listActiveTripMembers(input.tripId);
    if (members.some((member) => !member || member.status !== "active")) {
      return badRequest(
        "Every expense participant must be an active trip member",
        "expense_participant_not_member",
      );
    }
    if (members.length === 0)
      return badRequest(
        "Expense must have at least one participant",
        "empty_expense_participants",
      );
    const base = roundMoney(input.amount / members.length);
    let remaining = roundMoney(input.amount);
    return ok(
      members.map((member, index) => {
        const activeMember = member!;
        const amount =
          index === members.length - 1 ? roundMoney(remaining) : base;
        remaining = roundMoney(remaining - amount);
        return {
          userId: activeMember.userId,
          amount,
          activityId: input.activityId,
        };
      }),
    );
  }

  private async isActiveMember(
    tripId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.expenses.findTripMember({ tripId, userId });
    return member?.status === "active";
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
