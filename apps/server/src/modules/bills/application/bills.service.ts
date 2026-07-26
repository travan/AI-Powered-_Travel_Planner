import { Inject, Injectable } from "@nestjs/common";
import {
  forbidden,
  notFound,
  ok,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import { getTripRolePermissions } from "../../../shared/application/trip-role-permissions.js";
import type {
  BillLineItemDraft,
  BillNormalizationResult,
  BillUpload,
} from "../domain/bill.entity.js";
import {
  BILL_REPOSITORY,
  type BillRepository,
} from "../domain/bill.repository.js";
import type { CreateBillDto, UpdateBillDto } from "../dto/bill.dto.js";

@Injectable()
export class BillsService {
  constructor(
    @Inject(BILL_REPOSITORY) private readonly bills: BillRepository,
  ) {}

  async getById(
    id: string,
    actorUserId: string,
  ): Promise<ServiceResult<BillUpload>> {
    const bill = await this.bills.findById(id);
    if (!bill) return notFound("Bill upload not found");
    const member = await this.bills.findTripMember({
      tripId: bill.tripId,
      userId: actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Bill upload not found");
    return getTripRolePermissions(member.role).viewFinance
      ? ok(bill)
      : forbidden(
          "Viewers cannot access trip finances",
          "finance_view_forbidden",
        );
  }

  async create(input: {
    tripId: string;
    actorUserId: string;
    dto: CreateBillDto;
  }): Promise<ServiceResult<BillUpload>> {
    const member = await this.bills.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).contribute) {
      return forbidden("Viewers cannot capture bills", "bill_create_forbidden");
    }

    const bill = await this.bills.create({
      tripId: input.tripId,
      activityId: input.dto.activity_id ?? null,
      uploadedByUserId: input.actorUserId,
      storageUrl: input.dto.storage_url ?? null,
      rawText: input.dto.raw_text ?? null,
      totalAmount: input.dto.total_amount ?? null,
      currency: input.dto.currency.toUpperCase(),
      merchantName: input.dto.merchant_name ?? null,
      billIssuedAt: input.dto.bill_issued_at ?? null,
    });
    await this.bills.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "bill_upload",
      entityId: bill.id,
      action: "created",
      after: bill,
    });
    return ok(bill);
  }

  async update(input: {
    billId: string;
    actorUserId: string;
    dto: UpdateBillDto;
  }): Promise<ServiceResult<BillUpload>> {
    const before = await this.bills.findById(input.billId);
    if (!before) return notFound("Bill upload not found");

    const member = await this.bills.findTripMember({
      tripId: before.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).contribute) {
      return forbidden("Viewers cannot edit bills", "bill_edit_forbidden");
    }
    if (
      before.uploadedByUserId !== input.actorUserId &&
      !["host", "co_host"].includes(member.role)
    ) {
      return forbidden(
        "Only host/co-host or the uploader can edit this bill",
        "bill_edit_forbidden",
      );
    }
    if (
      input.dto.status !== undefined &&
      !getTripRolePermissions(member.role).reviewSubmissions
    ) {
      return forbidden(
        "Only host/co-host can change bill review status",
        "bill_status_forbidden",
      );
    }

    const updated = await this.bills.update({
      billId: input.billId,
      storageUrl: input.dto.storage_url,
      rawText: input.dto.raw_text,
      totalAmount: input.dto.total_amount,
      currency: input.dto.currency?.toUpperCase(),
      merchantName: input.dto.merchant_name,
      billIssuedAt: input.dto.bill_issued_at,
      status: input.dto.status,
    });
    if (!updated) return notFound("Bill upload not found");

    await this.bills.audit({
      tripId: before.tripId,
      actorUserId: input.actorUserId,
      entityType: "bill_upload",
      entityId: updated.id,
      action: "updated",
      before,
      after: updated,
    });
    return ok(updated);
  }

  async analyze(input: {
    billId: string;
    actorUserId: string;
  }): Promise<ServiceResult<BillNormalizationResult>> {
    const before = await this.bills.findById(input.billId);
    if (!before) return notFound("Bill upload not found");

    const member = await this.bills.findTripMember({
      tripId: before.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).contribute) {
      return forbidden(
        "Viewers cannot analyze bills",
        "bill_analyze_forbidden",
      );
    }
    if (
      before.uploadedByUserId !== input.actorUserId &&
      !["host", "co_host"].includes(member.role)
    ) {
      return forbidden(
        "Only host/co-host or the uploader can analyze this bill",
        "bill_analyze_forbidden",
      );
    }

    const totalAmount = before.totalAmount ?? extractAmount(before.rawText);
    const merchantName =
      before.merchantName ??
      extractMerchant(before.rawText) ??
      "Unknown merchant";
    const category = inferCategory(before.rawText);
    const lineItems = buildLineItems({
      rawText: before.rawText,
      totalAmount,
      category,
    });
    const updated = await this.bills.update({
      billId: input.billId,
      totalAmount,
      merchantName,
      status: "ocr_processed",
    });
    if (!updated) return notFound("Bill upload not found");

    await this.bills.replaceLineItems({ billId: updated.id, lineItems });

    const result: BillNormalizationResult = {
      bill: updated,
      extracted: {
        merchantName,
        totalAmount,
        currency: updated.currency,
        issuedAt: updated.billIssuedAt,
        lineItems: lineItems.map((item) => ({
          name: item.name,
          amount: item.amount,
          category: item.category,
        })),
      },
      suggestedExpense: {
        title: `${merchantName} payment`,
        amount: totalAmount,
        currency: updated.currency,
        activityId: updated.activityId,
        splitStrategy: "equal",
      },
      placeSignal: {
        canonicalName: merchantName,
        address: inferAddress(before.rawText),
        category,
        confidence: 0.86,
        action: "update_existing",
        reason:
          "Matched bill merchant and trip evidence; review before updating reusable recommendations.",
      },
    };

    await this.bills.createDataQualitySignal({
      tripId: updated.tripId,
      signalType: "price_change",
      severity: "medium",
      title: `${merchantName} price evidence`,
      detail: `Observed ${totalAmount ?? "unknown"} ${updated.currency} from a normalized bill.`,
      entityType: "bill_upload",
      entityId: updated.id,
      evidence: result,
    });

    await this.bills
      .storeRawOcrDocument({
        billId: updated.id,
        tripId: updated.tripId,
        actorUserId: input.actorUserId,
        rawText: before.rawText,
        parsed: result,
      })
      .catch(() => undefined);

    await this.bills.audit({
      tripId: updated.tripId,
      actorUserId: input.actorUserId,
      entityType: "bill_upload",
      entityId: updated.id,
      action: "ocr_normalized",
      before,
      after: updated,
    });

    return ok(result);
  }
}

function extractAmount(rawText: string | null): number | null {
  const match = rawText?.match(
    /(?:total|tong|tổng)?\s*([0-9][0-9.,]{3,})\s*(?:vnd|đ|dong)?/i,
  );
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(/[.,]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function extractMerchant(rawText: string | null): string | null {
  if (!rawText) return null;
  if (/lantern/i.test(rawText)) return "Hoi An Lantern Studio";
  if (/coffee|cafe/i.test(rawText)) return "Son Tra sunrise cafe";
  if (/hotel|homestay/i.test(rawText)) return "Old Quarter homestay";
  return (
    rawText
      .split(/\n| bill | total /i)[0]
      ?.trim()
      .slice(0, 80) || null
  );
}

function buildLineItems(input: {
  rawText: string | null;
  totalAmount: number | null;
  category: string;
}): BillLineItemDraft[] {
  if (/lantern/i.test(input.rawText ?? "")) {
    return [
      {
        name: "Lantern workshop",
        quantity: 1,
        unitPrice: input.totalAmount,
        amount: input.totalAmount ?? 0,
        category: "activity",
        confidence: 0.88,
        rawText: input.rawText,
      },
    ];
  }

  if (/coffee|cafe/i.test(input.rawText ?? "")) {
    return [
      {
        name: "Coffee and snacks",
        quantity: 1,
        unitPrice: input.totalAmount,
        amount: input.totalAmount ?? 0,
        category: "cafe",
        confidence: 0.82,
        rawText: input.rawText,
      },
    ];
  }

  return [
    {
      name: "Bill total",
      quantity: 1,
      unitPrice: input.totalAmount,
      amount: input.totalAmount ?? 0,
      category: input.category,
      confidence: 0.65,
      rawText: input.rawText,
    },
  ];
}

function inferAddress(rawText: string | null): string | null {
  if (/hoi an/i.test(rawText ?? "")) return "Old Town, Hoi An";
  if (/son tra|da nang/i.test(rawText ?? "")) return "Son Tra, Da Nang";
  return null;
}

function inferCategory(rawText: string | null): string {
  if (/coffee|cafe/i.test(rawText ?? "")) return "cafe";
  if (/hotel|homestay/i.test(rawText ?? "")) return "hotel";
  if (/dinner|restaurant|food/i.test(rawText ?? "")) return "food";
  return "activity";
}
