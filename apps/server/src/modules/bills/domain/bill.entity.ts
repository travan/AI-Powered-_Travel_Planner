export type BillUpload = {
  id: string;
  tripId: string;
  activityId: string | null;
  uploadedByUserId: string;
  status: string;
  storageUrl: string | null;
  rawText: string | null;
  totalAmount: number | null;
  currency: string;
  merchantName: string | null;
  billIssuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillLineItemDraft = {
  name: string;
  quantity: number;
  unitPrice: number | null;
  amount: number;
  category: string | null;
  confidence: number | null;
  rawText: string | null;
};

export type BillNormalizationResult = {
  bill: BillUpload;
  extracted: {
    merchantName: string | null;
    totalAmount: number | null;
    currency: string;
    issuedAt: string | null;
    lineItems: Array<{ name: string; amount: number; category: string | null }>;
  };
  suggestedExpense: {
    title: string;
    amount: number | null;
    currency: string;
    activityId: string | null;
    splitStrategy: "equal";
  };
  placeSignal: {
    canonicalName: string | null;
    address: string | null;
    category: string;
    confidence: number;
    action: "create_candidate" | "update_existing" | "mark_outdated";
    reason: string;
  };
};
