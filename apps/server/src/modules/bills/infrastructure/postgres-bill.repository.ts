import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGO_DATABASE, SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { TripMember, TripMemberRole, TripMemberStatus } from "../../trips/domain/trip.entity.js";
import type { BillLineItemDraft, BillUpload } from "../domain/bill.entity.js";
import type { BillRepository } from "../domain/bill.repository.js";

type BillUploadRow = {
  id: string;
  trip_id: string;
  activity_id: string | null;
  uploaded_by_user_id: string;
  status: string;
  storage_url: string | null;
  raw_text: string | null;
  total_amount: string | number | null;
  currency: string;
  merchant_name: string | null;
  bill_issued_at: string | null;
  created_at: string;
  updated_at: string;
};

type TripMemberRow = {
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_by_user_id: string | null;
  joined_at: string;
};

@Injectable()
export class PostgresBillRepository implements BillRepository {
  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(MONGO_DATABASE) private readonly mongo: Db
  ) {}

  async findById(id: string): Promise<BillUpload | null> {
    const result = await this.sql.query<BillUploadRow>(
      `${billSelectSql}
       from bill_uploads
       where id = $1
       limit 1`,
      [id]
    );
    return result.rows[0] ? mapBillUpload(result.rows[0]) : null;
  }

  async findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null> {
    const result = await this.sql.query<TripMemberRow>(
      `select trip_id::text, user_id::text, role, status, invited_by_user_id::text, joined_at::text
       from trip_members
       where trip_id = $1 and user_id = $2
       limit 1`,
      [input.tripId, input.userId]
    );
    return result.rows[0] ? mapMember(result.rows[0]) : null;
  }

  async create(input: {
    tripId: string;
    activityId?: string | null;
    uploadedByUserId: string;
    storageUrl?: string | null;
    rawText?: string | null;
    totalAmount?: number | null;
    currency: string;
    merchantName?: string | null;
    billIssuedAt?: string | null;
  }): Promise<BillUpload> {
    const result = await this.sql.query<BillUploadRow>(
      `insert into bill_uploads (
         trip_id, activity_id, uploaded_by_user_id, storage_url, raw_text,
         total_amount, currency, merchant_name, bill_issued_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning ${billReturningSql}`,
      [
        input.tripId,
        input.activityId ?? null,
        input.uploadedByUserId,
        input.storageUrl ?? null,
        input.rawText ?? null,
        input.totalAmount ?? null,
        input.currency,
        input.merchantName ?? null,
        input.billIssuedAt ?? null,
      ]
    );
    return mapBillUpload(result.rows[0]!);
  }

  async update(input: {
    billId: string;
    storageUrl?: string | null;
    rawText?: string | null;
    totalAmount?: number | null;
    currency?: string;
    merchantName?: string | null;
    billIssuedAt?: string | null;
    status?: string;
  }): Promise<BillUpload | null> {
    const result = await this.sql.query<BillUploadRow>(
      `update bill_uploads
       set storage_url = coalesce($2, storage_url),
           raw_text = coalesce($3, raw_text),
           total_amount = coalesce($4, total_amount),
           currency = coalesce($5, currency),
           merchant_name = coalesce($6, merchant_name),
           bill_issued_at = coalesce($7, bill_issued_at),
           status = coalesce($8, status),
           updated_at = now()
       where id = $1
       returning ${billReturningSql}`,
      [
        input.billId,
        input.storageUrl ?? null,
        input.rawText ?? null,
        input.totalAmount ?? null,
        input.currency ?? null,
        input.merchantName ?? null,
        input.billIssuedAt ?? null,
        input.status ?? null,
      ]
    );
    return result.rows[0] ? mapBillUpload(result.rows[0]) : null;
  }

  async replaceLineItems(input: { billId: string; lineItems: BillLineItemDraft[] }): Promise<void> {
    await this.sql.query(`delete from bill_line_items where bill_upload_id = $1`, [input.billId]);
    for (const item of input.lineItems) {
      await this.sql.query(
        `insert into bill_line_items (bill_upload_id, name, quantity, unit_price, amount, category, confidence, raw_text)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.billId,
          item.name,
          item.quantity,
          item.unitPrice,
          item.amount,
          item.category,
          item.confidence,
          item.rawText,
        ]
      );
    }
  }

  async createDataQualitySignal(input: {
    tripId: string;
    signalType: string;
    severity: "low" | "medium" | "high";
    title: string;
    detail: string;
    entityType: string;
    entityId?: string | null;
    evidence: Record<string, unknown>;
  }): Promise<void> {
    await this.sql.query(
      `insert into data_quality_signals (
         trip_id, signal_type, severity, title, detail, entity_type, entity_id, evidence
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.tripId,
        input.signalType,
        input.severity,
        input.title,
        input.detail,
        input.entityType,
        input.entityId ?? null,
        input.evidence,
      ]
    );
  }

  async storeRawOcrDocument(input: {
    billId: string;
    tripId: string;
    actorUserId: string;
    rawText: string | null;
    parsed: Record<string, unknown>;
  }): Promise<void> {
    await this.mongo.collection("bill_ocr_documents").insertOne({
      bill_id: input.billId,
      trip_id: input.tripId,
      actor_user_id: input.actorUserId,
      raw_text: input.rawText,
      parsed: input.parsed,
      created_at: new Date(),
    });
  }

  async audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.sql.query(
      `insert into audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, before_snapshot, after_snapshot)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.tripId,
        input.actorUserId,
        input.entityType,
        input.entityId ?? null,
        input.action,
        input.before ?? null,
        input.after ?? null,
      ]
    );
  }
}

const billSelectSql = `select id::text, trip_id::text, activity_id::text, uploaded_by_user_id::text, status,
                              storage_url, raw_text, total_amount, currency, merchant_name,
                              bill_issued_at::text, created_at::text, updated_at::text`;

const billReturningSql = `id::text, trip_id::text, activity_id::text, uploaded_by_user_id::text, status,
                          storage_url, raw_text, total_amount, currency, merchant_name,
                          bill_issued_at::text, created_at::text, updated_at::text`;

function mapBillUpload(row: BillUploadRow): BillUpload {
  return {
    id: row.id,
    tripId: row.trip_id,
    activityId: row.activity_id,
    uploadedByUserId: row.uploaded_by_user_id,
    status: row.status,
    storageUrl: row.storage_url,
    rawText: row.raw_text,
    totalAmount: row.total_amount === null ? null : Number(row.total_amount),
    currency: row.currency,
    merchantName: row.merchant_name,
    billIssuedAt: row.bill_issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: TripMemberRow): TripMember {
  return {
    tripId: row.trip_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}
