import { describe, expect, it, vi } from "vitest";
import { BillsService } from "../../../../../../apps/server/src/modules/bills/application/bills.service.js";

function buildRepository(overrides = {}) {
  return {
    findById: vi.fn(),
    findTripMember: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    replaceLineItems: vi.fn().mockResolvedValue(undefined),
    createDataQualitySignal: vi.fn().mockResolvedValue(undefined),
    storeRawOcrDocument: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Nest BillsService analyze", () => {
  it("normalizes raw bill text, writes line items, and creates a quality signal", async () => {
    const bill = {
      id: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      activityId: "33333333-3333-4333-8333-333333333333",
      uploadedByUserId: "44444444-4444-4444-8444-444444444444",
      status: "draft",
      storageUrl: null,
      rawText: "Hoi An Lantern Studio bill total 600000 VND",
      totalAmount: null,
      currency: "VND",
      merchantName: null,
      billIssuedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = { ...bill, status: "ocr_processed", merchantName: "Hoi An Lantern Studio", totalAmount: 600000 };
    const repository = buildRepository({
      findById: vi.fn().mockResolvedValue(bill),
      findTripMember: vi.fn().mockResolvedValue({
        tripId: bill.tripId,
        userId: bill.uploadedByUserId,
        role: "contributor",
        status: "active",
        invitedByUserId: null,
        joinedAt: new Date().toISOString(),
      }),
      update: vi.fn().mockResolvedValue(updated),
    });
    const service = new BillsService(repository);

    const result = await service.analyze({ billId: bill.id, actorUserId: bill.uploadedByUserId });

    expect(result).toMatchObject({
      ok: true,
      value: {
        bill: { status: "ocr_processed", totalAmount: 600000 },
        suggestedExpense: { title: "Hoi An Lantern Studio payment", amount: 600000 },
        placeSignal: { category: "activity", action: "update_existing" },
      },
    });
    expect(repository.replaceLineItems).toHaveBeenCalledWith({
      billId: bill.id,
      lineItems: [expect.objectContaining({ name: "Lantern workshop", amount: 600000 })],
    });
    expect(repository.createDataQualitySignal).toHaveBeenCalledWith(
      expect.objectContaining({ signalType: "price_change", entityType: "bill_upload", entityId: bill.id })
    );
    expect(repository.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ocr_normalized" }));
  });

  it("prevents unrelated members from analyzing another user's bill", async () => {
    const repository = buildRepository({
      findById: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        tripId: "22222222-2222-4222-8222-222222222222",
        activityId: null,
        uploadedByUserId: "33333333-3333-4333-8333-333333333333",
        status: "draft",
        storageUrl: null,
        rawText: "Coffee 45000 total 45000",
        totalAmount: null,
        currency: "VND",
        merchantName: null,
        billIssuedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      findTripMember: vi.fn().mockResolvedValue({
        tripId: "22222222-2222-4222-8222-222222222222",
        userId: "44444444-4444-4444-8444-444444444444",
        role: "viewer",
        status: "active",
        invitedByUserId: null,
        joinedAt: new Date().toISOString(),
      }),
    });
    const service = new BillsService(repository);

    await expect(
      service.analyze({
        billId: "11111111-1111-4111-8111-111111111111",
        actorUserId: "44444444-4444-4444-8444-444444444444",
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "bill_analyze_forbidden" },
    });
  });
});
