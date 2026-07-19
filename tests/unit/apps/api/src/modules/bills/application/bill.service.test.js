import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const billStoreMock = {
    createBillUpload: vi.fn(),
    getBillUploadSummary: vi.fn(),
};
const billStorePath = require.resolve("../../../../../../../../apps/api/dist/db/bill-store.js");
require.cache[billStorePath] = {
    id: billStorePath,
    filename: billStorePath,
    loaded: true,
    exports: billStoreMock,
};

const bill_store_js_1 = billStoreMock;
const bill_service_1 = await import("../../../../../../../../apps/api/dist/modules/bills/application/bill.service.js");
const service = new bill_service_1.BillService();
describe("BillService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("maps forbidden bill creation to a service error", async () => {
        vi.mocked(bill_store_js_1.createBillUpload).mockResolvedValue(null);
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
        vi.mocked(bill_store_js_1.getBillUploadSummary).mockResolvedValue(null);
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
