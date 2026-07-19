import { beforeEach, describe, expect, it, vi } from "vitest";
const bill_normalization_worker_1 = await import("../../../../../../apps/api/dist/workers/bill-normalization.worker");
describe("bill normalization worker", () => {
    it("extracts total and bill line items from OCR text", () => {
        const parsed = bill_normalization_worker_1.parseBillOcrText("MADAME LAN\nMi Quang x4 340000\nNuoc sa x4 180000\nTotal 520000");
        expect(parsed.totalAmount).toBe(520000);
        expect(parsed.lineItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: "Mi Quang", amount: 340000, quantity: 4, category: "food" }),
            expect.objectContaining({ name: "Nuoc sa", amount: 180000, quantity: 4 }),
        ]));
    });
    it("infers total from items when no total line is present", () => {
        const parsed = bill_normalization_worker_1.parseBillOcrText("Coffee 45000\nCake 55000");
        expect(parsed.totalAmount).toBe(100000);
        expect(parsed.confidenceScore).toBeGreaterThan(0.7);
    });
    it("does not treat merchant names with long numeric suffixes as line items", () => {
        const parsed = bill_normalization_worker_1.parseBillOcrText("Smoke OCR Cafe 1784218912186\nCoffee x2 90000\nTotal 90000");
        expect(parsed.lineItems).toHaveLength(1);
        expect(parsed.lineItems[0]?.name).toBe("Coffee");
    });
});
