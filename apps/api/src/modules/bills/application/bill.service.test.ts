import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBillUpload, getBillUploadSummary } from "../../../db/bill-store.js";
import { BillService } from "./bill.service";

vi.mock("../../../db/bill-store.js", () => ({
  createBillUpload: vi.fn(),
  getBillUploadSummary: vi.fn(),
}));

const service = new BillService();

describe("BillService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps forbidden bill creation to a service error", async () => {
    vi.mocked(createBillUpload).mockResolvedValue(null);

    const result = await service.create({
      tripId: "trip-1",
      userId: "viewer-1",
      dto: {
        raw_ocr_text: "Coffee 45000 Total 45000",
        storage_url: "local://manual-ocr-entry",
        currency: "VND",
        place_type: "restaurant",
        create_expense: true,
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        statusCode: 403,
        message: "You cannot upload bills to this trip",
      },
    });
  });

  it("returns not_found when bill summary is missing", async () => {
    vi.mocked(getBillUploadSummary).mockResolvedValue(null);

    const result = await service.getById("bill-1");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_found",
        statusCode: 404,
        message: "Bill upload not found",
      },
    });
  });
});
