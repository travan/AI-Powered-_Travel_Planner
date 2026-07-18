import type { BillLineItemDraft, BillUpload } from "./bill.entity.js";
import type { TripMember } from "../../trips/domain/trip.entity.js";

export const BILL_REPOSITORY = Symbol("BILL_REPOSITORY");

export interface BillRepository {
  findById(id: string): Promise<BillUpload | null>;
  findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null>;
  create(input: {
    tripId: string;
    activityId?: string | null;
    uploadedByUserId: string;
    storageUrl?: string | null;
    rawText?: string | null;
    totalAmount?: number | null;
    currency: string;
    merchantName?: string | null;
    billIssuedAt?: string | null;
  }): Promise<BillUpload>;
  update(input: {
    billId: string;
    storageUrl?: string | null;
    rawText?: string | null;
    totalAmount?: number | null;
    currency?: string;
    merchantName?: string | null;
    billIssuedAt?: string | null;
    status?: string;
  }): Promise<BillUpload | null>;
  replaceLineItems(input: { billId: string; lineItems: BillLineItemDraft[] }): Promise<void>;
  createDataQualitySignal(input: {
    tripId: string;
    signalType: string;
    severity: "low" | "medium" | "high";
    title: string;
    detail: string;
    entityType: string;
    entityId?: string | null;
    evidence: Record<string, unknown>;
  }): Promise<void>;
  storeRawOcrDocument(input: {
    billId: string;
    tripId: string;
    actorUserId: string;
    rawText: string | null;
    parsed: Record<string, unknown>;
  }): Promise<void>;
  audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void>;
}
