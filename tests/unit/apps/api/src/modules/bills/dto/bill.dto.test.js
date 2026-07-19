import { beforeEach, describe, expect, it, vi } from "vitest";
const bill_dto_1 = await import("../../../../../../../../apps/api/dist/modules/bills/dto/bill.dto");
describe("bill DTO validation", () => {
    it("normalizes manual OCR bill payloads", () => {
        const parsed = bill_dto_1.createBillUploadDto.parse({
            raw_ocr_text: "  Cafe Test\nCoffee 45000\nTotal 45000  ",
            currency: "vnd",
            total_amount: "45000",
            create_expense: "true",
        });
        expect(parsed).toMatchObject({
            raw_ocr_text: "Cafe Test\nCoffee 45000\nTotal 45000",
            currency: "VND",
            total_amount: 45000,
            create_expense: true,
            storage_url: "local://manual-ocr-entry",
        });
    });
    it("rejects tiny OCR payloads and invalid split ids", () => {
        expect(bill_dto_1.createBillUploadDto.safeParse({ raw_ocr_text: "bad" }).success).toBe(false);
        expect(bill_dto_1.createBillUploadDto.safeParse({
            raw_ocr_text: "Coffee 45000 Total 45000",
            split_user_ids: ["not-a-uuid"],
        }).success).toBe(false);
    });
});
