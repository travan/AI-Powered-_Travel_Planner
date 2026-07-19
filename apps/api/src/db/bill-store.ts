import type { BillUploadSummary, CreateBillUploadRequest } from "@travel/types";
import type { PoolClient } from "pg";
import { approvalStatusForNewContribution, buildEqualSplits, canWriteTrip } from "../modules/trips/domain/trip-policy.js";
import { parseBillOcrText } from "../workers/bill-normalization.worker.js";
import { getDb } from "./mongodb.js";
import { query, withPostgresTransaction } from "./postgres.js";

type Membership = {
  role: "host" | "co_host" | "contributor" | "viewer";
};

type BillUploadRow = Omit<BillUploadSummary, "line_items">;

export async function createBillUpload(input: {
  tripId: string;
  userId: string;
  body: CreateBillUploadRequest;
}): Promise<BillUploadSummary | null> {
  const membership = await getTripMembership({ tripId: input.tripId, userId: input.userId });
  if (!membership || !canWriteTrip(membership.role)) return null;

  const billId = await withPostgresTransaction(async (client) => {
    const placeId = input.body.place_id ?? await resolveOrCreatePlace(client, {
      userId: input.userId,
      citySlug: input.body.city_slug,
      name: input.body.place_name,
      address: input.body.place_address,
      type: input.body.place_type ?? "restaurant",
    });
    const parsed = parseBillOcrText(input.body.raw_ocr_text);
    const totalAmount = input.body.total_amount ?? parsed.totalAmount;
    const status = totalAmount ? "parsed" : "needs_review";

    const bill = await client.query<{ id: string }>(
      `insert into bill_uploads (
         trip_id, uploaded_by_user_id, place_id, activity_id, storage_url,
         status, total_amount, currency, bill_date
       )
       values ($1, $2, $3, $4, $5, 'processing', $6, $7, $8)
       returning id::text`,
      [
        input.tripId,
        input.userId,
        placeId,
        input.body.activity_id ?? null,
        input.body.storage_url ?? "local://manual-ocr-entry",
        totalAmount,
        input.body.currency ?? "VND",
        input.body.bill_date ?? null,
      ]
    );
    const billId = bill.rows[0]?.id;
    if (!billId) return null;

    await saveRawBillDocument({
      billId,
      tripId: input.tripId,
      userId: input.userId,
      rawText: input.body.raw_ocr_text,
      parsed,
    });

    for (const item of parsed.lineItems) {
      await client.query(
        `insert into bill_line_items (
           bill_upload_id, name, quantity, unit_price, amount, category, confidence_score
         )
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [billId, item.name, item.quantity, item.unitPrice, item.amount, item.category, item.confidenceScore]
      );
    }

    await client.query(
      `update bill_uploads
       set status = $2,
           total_amount = coalesce(total_amount, $3)
       where id = $1`,
      [billId, status, totalAmount]
    );

    if (placeId && totalAmount) {
      await client.query(
        `insert into place_price_history (
           place_id, price_type, price, currency, source, confidence_score, metadata
         )
         values ($1, 'average_bill', $2, $3, 'user_bill', $4, $5)`,
        [
          placeId,
          totalAmount,
          input.body.currency ?? "VND",
          parsed.confidenceScore,
          { bill_upload_id: billId, line_item_count: parsed.lineItems.length },
        ]
      );
    }

    if (placeId && (input.body.place_name || input.body.place_address)) {
      await insertPlaceChangeSignal(client, {
        placeId,
        candidateName: input.body.place_name,
        candidateAddress: input.body.place_address,
        evidence: {
          bill_upload_id: billId,
          total_amount: totalAmount,
          raw_source: "ocr_bill",
        },
      });
    }

    if (input.body.create_expense !== false && totalAmount) {
      await createExpenseFromBill(client, {
        tripId: input.tripId,
        userId: input.userId,
        role: membership.role,
        billId,
        placeId,
        activityId: input.body.activity_id ?? null,
        title: input.body.place_name ? `Bill at ${input.body.place_name}` : "Bill upload",
        amount: totalAmount,
        currency: input.body.currency ?? "VND",
        splitUserIds: input.body.split_user_ids,
      });
    }

    await client.query(
      `insert into trip_audit_logs (trip_id, actor_user_id, action, target_type, target_id, after_snapshot)
       values ($1, $2, 'bill.normalized', 'bill_upload', $3, $4)`,
      [
        input.tripId,
        input.userId,
        billId,
        { total_amount: totalAmount, status, line_item_count: parsed.lineItems.length },
      ]
    );

    return billId;
  });

  return billId ? getBillUploadSummary(billId) : null;
}

export async function getBillUploadSummary(billId: string): Promise<BillUploadSummary | null> {
  const bill = await query<BillUploadRow & { expense_id: string | null }>(
    `select
       b.id::text,
       b.trip_id::text,
       b.uploaded_by_user_id::text,
       b.place_id::text,
       b.activity_id::text,
       b.storage_url,
       b.status,
       b.total_amount::float8 as total_amount,
       b.currency,
       b.bill_date::text,
       e.id::text as expense_id,
       b.created_at::text
     from bill_uploads b
     left join expenses e on e.bill_upload_id = b.id
     where b.id = $1
     limit 1`,
    [billId]
  );
  const row = bill.rows[0];
  if (!row) return null;

  const lineItems = await query<BillUploadSummary["line_items"][number]>(
    `select
       id::text,
       name,
       quantity::float8 as quantity,
       unit_price::float8 as unit_price,
       amount::float8 as amount,
       category,
       confidence_score::float8 as confidence_score
     from bill_line_items
     where bill_upload_id = $1
     order by id`,
    [billId]
  );

  return {
    ...row,
    line_items: lineItems.rows,
  };
}

async function createExpenseFromBill(
  client: PoolClient,
  input: {
    tripId: string;
    userId: string;
    role: Membership["role"];
    billId: string;
    placeId: string | null;
    activityId: string | null;
    title: string;
    amount: number;
    currency: string;
    splitUserIds?: string[];
  }
) {
  const approvalStatus = approvalStatusForNewContribution(input.role);
  const members = await client.query(
    `select user_id::text
     from trip_members
     where trip_id = $1 and status = 'active'`,
    [input.tripId]
  );
  const activeMemberIds = new Set(members.rows.map((member) => member.user_id).filter(Boolean) as string[]);
  const splitUserIds = input.splitUserIds?.length ? input.splitUserIds : [...activeMemberIds];
  if (splitUserIds.some((userId) => !activeMemberIds.has(userId))) return null;

  const expense = await client.query<{ id: string }>(
    `insert into expenses (
       trip_id, activity_id, place_id, bill_upload_id, paid_by_user_id,
       title, amount, currency, expense_type, approval_status,
       created_by_user_id, updated_by_user_id, approved_by_user_id,
       locked_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'food', $9, $5, $5,
       case when $9 = 'approved' then $5::uuid else null end,
       case when $9 = 'approved' then now() else null end
     )
     returning id::text`,
    [
      input.tripId,
      input.activityId,
      input.placeId,
      input.billId,
      input.userId,
      input.title,
      input.amount,
      input.currency,
      approvalStatus,
    ]
  );
  const expenseId = expense.rows[0]?.id;
  if (!expenseId) return null;

  for (const split of buildEqualSplits({ amount: input.amount, userIds: splitUserIds })) {
    await client.query(
      `insert into expense_splits (expense_id, user_id, share_amount, share_percent, status)
       values ($1, $2, $3, $4, 'pending')`,
      [expenseId, split.userId, split.shareAmount, split.sharePercent]
    );
  }

  if (approvalStatus === "pending") {
    await client.query(
      `insert into trip_change_requests (trip_id, target_type, target_id, requested_by_user_id, change_payload, reason)
       values ($1, 'expense', $2, $3, $4, 'OCR bill expense needs host review')`,
      [input.tripId, expenseId, input.userId, { title: input.title, amount: input.amount, bill_upload_id: input.billId }]
    );
  }

  return expenseId;
}

async function resolveOrCreatePlace(
  client: PoolClient,
  input: {
    userId: string;
    citySlug?: string;
    name?: string;
    address?: string;
    type: string;
  }
): Promise<string | null> {
  if (!input.name) return null;

  const exact = await client.query<{ id: string }>(
    `select id::text
     from places
     where ($1::text is null or city_slug = $1)
       and lower(current_name) = lower($2)
       and coalesce(lower(normalized_address), '') = coalesce(lower($3), '')
     limit 1`,
    [input.citySlug ?? null, input.name, input.address ?? null]
  );
  if (exact.rows[0]?.id) return exact.rows[0].id;

  const sameAddress = input.address
    ? await client.query<{ id: string }>(
        `select id::text
         from places
         where ($1::text is null or city_slug = $1)
           and lower(normalized_address) = lower($2)
         order by quality_score desc
         limit 1`,
        [input.citySlug ?? null, input.address]
      )
    : { rows: [] };
  if (sameAddress.rows[0]?.id) return sameAddress.rows[0].id;

  const sameName = await client.query<{ id: string }>(
    `select id::text
     from places
     where ($1::text is null or city_slug = $1)
       and lower(current_name) = lower($2)
     order by quality_score desc
     limit 1`,
    [input.citySlug ?? null, input.name]
  );
  if (sameName.rows[0]?.id) return sameName.rows[0].id;

  const created = await client.query<{ id: string }>(
    `insert into places (
       city_slug, canonical_name, current_name, type, normalized_address,
       source, status, quality_score, freshness_score, created_by_user_id, last_verified_at
     )
     values ($1, $2, $2, $3, $4, 'user_added', 'active', 0.45, 0.65, $5, now())
     returning id::text`,
    [input.citySlug ?? null, input.name, input.type, input.address ?? null, input.userId]
  );
  return created.rows[0]?.id ?? null;
}

async function insertPlaceChangeSignal(
  client: PoolClient,
  input: {
    placeId: string;
    candidateName?: string;
    candidateAddress?: string;
    evidence: Record<string, unknown>;
  }
) {
  const signalType = input.candidateAddress && input.candidateName ? "price_changed" : "price_changed";
  await client.query(
    `insert into place_change_signals (
       place_id, candidate_name, candidate_address, signal_type,
       source, confidence_score, evidence, status
     )
     values ($1, $2, $3, $4, 'user_bill', 0.78, $5, 'pending')`,
    [input.placeId, input.candidateName ?? null, input.candidateAddress ?? null, signalType, input.evidence]
  );
}

async function saveRawBillDocument(input: {
  billId: string;
  tripId: string;
  userId: string;
  rawText: string;
  parsed: ReturnType<typeof parseBillOcrText>;
}) {
  const db = await getDb();
  await db.collection("ocr_raw_documents").updateOne(
    { bill_upload_id: input.billId },
    {
      $set: {
        bill_upload_id: input.billId,
        trip_id: input.tripId,
        user_id: input.userId,
        raw_ocr_text: input.rawText,
        status: "parsed",
        parsed_total_amount: input.parsed.totalAmount,
        confidence_score: input.parsed.confidenceScore,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );

  await db.collection("bill_parse_candidates").insertOne({
    bill_upload_id: input.billId,
    total_amount: input.parsed.totalAmount,
    line_items: input.parsed.lineItems,
    confidence_score: input.parsed.confidenceScore,
    created_at: new Date(),
  });
}

async function getTripMembership(input: {
  tripId: string;
  userId: string;
}): Promise<Membership | null> {
  const result = await query<Membership>(
    `select role
     from trip_members
     where trip_id = $1 and user_id = $2 and status = 'active'
     limit 1`,
    [input.tripId, input.userId]
  );

  return result.rows[0] ?? null;
}
