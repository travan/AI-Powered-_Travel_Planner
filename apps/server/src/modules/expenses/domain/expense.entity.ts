export type ExpenseSplitStatus = "owed" | "settled" | "waived";

export type ExpenseSplit = {
  id: string;
  expenseId: string;
  activityId: string | null;
  userId: string;
  amount: number;
  status: ExpenseSplitStatus;
  settledAt: string | null;
};

export type Expense = {
  id: string;
  tripId: string;
  activityId: string | null;
  billUploadId: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  paidByUserId: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  splits: ExpenseSplit[];
};
