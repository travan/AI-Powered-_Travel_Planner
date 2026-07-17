import type {
  CreatePlaceSubmissionRequest,
  CreateTripActivityRequest,
  CreateTripExpenseRequest,
  TripActivitySummary,
  TripAuditLogSummary,
  TripChecklistItem,
  TripChangeRequestSummary,
  TripDetail,
  TripExpenseSummary,
  TripSummary,
  UserPlaceSubmissionSummary,
  UserProfileSummary,
} from "@travel/types";
import {
  approvalStatusForNewContribution,
  buildEqualSplits,
  canModerateTrip,
  canWriteTrip,
} from "../modules/trips/domain/trip-policy.js";
import { query, withPostgresTransaction } from "./postgres.js";

type Membership = {
  role: "host" | "co_host" | "contributor" | "viewer";
};

export async function getProfileSummary(userId: string): Promise<UserProfileSummary | null> {
  const result = await query<UserProfileSummary>(
    `select
       u.id::text as user_id,
       u.email::text as email,
       coalesce(p.display_name, u.full_name, u.email::text) as display_name,
       coalesce(p.avatar_url, u.avatar_url) as avatar_url,
       p.home_city_slug,
       coalesce(p.travel_preferences, '{}'::jsonb) as travel_preferences
     from users u
     left join profiles p on p.user_id = u.id
     where u.id = $1
     limit 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function listTripsForUser(userId: string): Promise<TripSummary[]> {
  const result = await query<TripSummary>(
    `select
       t.id::text,
       t.title,
       t.description,
       t.primary_city_slug,
       t.start_date::text,
       t.end_date::text,
       t.status,
       t.visibility,
       t.budget::float8 as budget,
       t.currency,
       tm.role,
       count(distinct tm_all.user_id)::int as member_count,
       count(distinct ta.id)::int as activity_count,
       count(distinct ci.id) filter (where ci.status = 'done')::int as checklist_done,
       count(distinct ci.id)::int as checklist_total,
       coalesce(sum(distinct e.amount), 0)::float8 as expense_total,
       t.created_at::text
     from trips t
     join trip_members tm on tm.trip_id = t.id and tm.user_id = $1 and tm.status = 'active'
     left join trip_members tm_all on tm_all.trip_id = t.id and tm_all.status = 'active'
     left join trip_activities ta on ta.trip_id = t.id
     left join trip_checklist_items ci on ci.trip_id = t.id
     left join expenses e on e.trip_id = t.id and e.approval_status = 'approved'
     group by t.id, tm.role
     order by t.start_date nulls last, t.created_at desc`,
    [userId]
  );

  return result.rows;
}

export async function getTripDetailForUser(input: {
  tripId: string;
  userId: string;
}): Promise<TripDetail | null> {
  const membership = await getTripMembership(input);
  if (!membership) return null;

  const summaryResult = await query<TripSummary>(
    `select
       t.id::text,
       t.title,
       t.description,
       t.primary_city_slug,
       t.start_date::text,
       t.end_date::text,
       t.status,
       t.visibility,
       t.budget::float8 as budget,
       t.currency,
       $2::text as role,
       (select count(*)::int from trip_members where trip_id = t.id and status = 'active') as member_count,
       (select count(*)::int from trip_activities where trip_id = t.id) as activity_count,
       (select count(*)::int from trip_checklist_items where trip_id = t.id and status = 'done') as checklist_done,
       (select count(*)::int from trip_checklist_items where trip_id = t.id) as checklist_total,
       coalesce((select sum(amount)::float8 from expenses where trip_id = t.id and approval_status = 'approved'), 0) as expense_total,
       t.created_at::text
     from trips t
     where t.id = $1`,
    [input.tripId, membership.role]
  );
  const summary = summaryResult.rows[0];
  if (!summary) return null;

  const [
    members,
    days,
    activities,
    checklist,
    accommodations,
    transports,
    expenses,
    changeRequests,
    placeSubmissions,
    auditLogs,
  ] = await Promise.all([
    query(
      `select
         u.id::text as user_id,
         u.email::text as email,
         coalesce(p.display_name, u.full_name) as display_name,
         tm.role,
         tm.status
       from trip_members tm
       join users u on u.id = tm.user_id
       left join profiles p on p.user_id = u.id
       where tm.trip_id = $1
       order by case tm.role when 'host' then 1 when 'co_host' then 2 when 'contributor' then 3 else 4 end`,
      [input.tripId]
    ),
    query(
      `select id::text, day_index, date::text, title
       from trip_days
       where trip_id = $1
       order by day_index`,
      [input.tripId]
    ),
    query<TripActivitySummary>(
      `select
         ta.id::text,
         ta.trip_day_id::text,
         ta.title,
         ta.status,
         ta.approval_status,
         coalesce(p.current_name, ta.place_name_snapshot) as place_name,
         ta.start_time::text,
         ta.end_time::text,
         ta.price_snapshot::float8 as price_snapshot,
         ta.created_by_user_id::text
       from trip_activities ta
       left join places p on p.id = ta.place_id
       where ta.trip_id = $1
       order by ta.start_time nulls last, ta.created_at`,
      [input.tripId]
    ),
    query<TripChecklistItem>(
      `select
         id::text,
         title,
         category,
         status,
         due_date::text,
         assigned_to_user_id::text
       from trip_checklist_items
       where trip_id = $1
       order by due_date nulls last, created_at`,
      [input.tripId]
    ),
    query(
      `select
         a.id::text,
         p.current_name as place_name,
         a.check_in_date::text,
         a.check_out_date::text,
         a.room_type,
         a.total_price::float8 as total_price,
         a.currency,
         a.booking_status
       from accommodations a
       left join places p on p.id = a.place_id
       where a.trip_id = $1
      order by a.check_in_date nulls last`,
      [input.tripId]
    ),
    query<TripDetail["transports"][number]>(
      `select
         ts.id::text,
         ts.mode,
         tp.name as provider_name,
         ts.service_number,
         coalesce(ts.from_label, from_hub.hub_code, from_hub.name) as from_label,
         coalesce(ts.to_label, to_hub.hub_code, to_hub.name) as to_label,
         ts.departure_time::text,
         ts.arrival_time::text,
         ts.service_class,
         ts.status
       from transport_segments ts
       left join transport_providers tp on tp.id = ts.provider_id
       left join transport_hubs from_hub on from_hub.id = ts.from_hub_id
       left join transport_hubs to_hub on to_hub.id = ts.to_hub_id
       where ts.trip_id = $1
       order by ts.departure_time nulls last`,
      [input.tripId]
    ),
    query<TripExpenseSummary>(
      `select
         e.id::text,
         e.activity_id::text,
         e.place_id::text,
         e.title,
         e.amount::float8 as amount,
         e.currency,
         e.expense_type,
         e.approval_status,
         e.created_by_user_id::text,
         u.email::text as paid_by_email,
         p.current_name as place_name,
         ta.title as activity_title
       from expenses e
       left join users u on u.id = e.paid_by_user_id
       left join places p on p.id = e.place_id
       left join trip_activities ta on ta.id = e.activity_id
       where e.trip_id = $1
       order by e.created_at desc`,
      [input.tripId]
    ),
    query<TripChangeRequestSummary>(
      `select
         cr.id::text,
         cr.target_type,
         cr.target_id::text,
         cr.requested_by_user_id::text,
         u.email::text as requested_by_email,
         cr.reviewed_by_user_id::text,
         reviewer.email::text as reviewed_by_email,
         cr.reviewed_at::text,
         cr.change_payload,
         cr.reason,
         cr.status,
         cr.created_at::text
       from trip_change_requests cr
       left join users u on u.id = cr.requested_by_user_id
       left join users reviewer on reviewer.id = cr.reviewed_by_user_id
       where cr.trip_id = $1
       order by case cr.status when 'pending' then 1 else 2 end, cr.created_at desc`,
      [input.tripId]
    ),
    query<UserPlaceSubmissionSummary>(
      `select
         id::text,
         raw_name,
         raw_type,
         raw_address,
         raw_notes,
         raw_price::float8 as raw_price,
         status,
         created_at::text
       from user_place_submissions
       where trip_id = $1
       order by created_at desc`,
      [input.tripId]
    ),
    query<TripAuditLogSummary>(
      `select
         tal.id::text,
         tal.actor_user_id::text,
         actor.email::text as actor_email,
         coalesce(profile.display_name, actor.full_name) as actor_display_name,
         tal.action,
         tal.target_type,
         tal.target_id::text,
         tal.before_snapshot,
         tal.after_snapshot,
         tal.created_at::text
       from trip_audit_logs tal
       left join users actor on actor.id = tal.actor_user_id
       left join profiles profile on profile.user_id = actor.id
       where tal.trip_id = $1
       order by tal.created_at desc
       limit 40`,
      [input.tripId]
    ),
  ]);
  const expenseIds = expenses.rows.map((expense) => expense.id);
  const splitRows = expenseIds.length > 0
    ? await query(
        `select
           es.id::text,
           es.expense_id::text,
           es.user_id::text,
           u.email::text as email,
           coalesce(p.display_name, u.full_name) as display_name,
           es.share_amount::float8 as share_amount,
           es.share_percent::float8 as share_percent,
           es.status
         from expense_splits es
         join users u on u.id = es.user_id
         left join profiles p on p.user_id = u.id
         where es.expense_id = any($1::uuid[])
         order by u.email`,
        [expenseIds]
      )
    : { rows: [] };
  const splitsByExpenseId = new Map<string, TripExpenseSummary["splits"]>();
  for (const split of splitRows.rows as Array<TripExpenseSummary["splits"][number] & { expense_id: string }>) {
    const list = splitsByExpenseId.get(split.expense_id) ?? [];
    list.push(split);
    splitsByExpenseId.set(split.expense_id, list);
  }

  return {
    ...summary,
    members: members.rows as TripDetail["members"],
    days: days.rows as TripDetail["days"],
    activities: activities.rows,
    checklist: checklist.rows,
    accommodations: accommodations.rows as TripDetail["accommodations"],
    transports: transports.rows,
    expenses: expenses.rows.map((expense) => ({
      ...expense,
      splits: splitsByExpenseId.get(expense.id) ?? [],
    })),
    change_requests: changeRequests.rows,
    place_submissions: placeSubmissions.rows,
    audit_logs: auditLogs.rows,
  };
}

export async function updateTripActivityStatus(input: {
  tripId: string;
  activityId: string;
  userId: string;
  status: "planned" | "booked" | "visited" | "skipped";
}): Promise<TripActivitySummary | null> {
  const membership = await getTripMembership(input);
  if (!membership || membership.role === "viewer") return null;

  return withPostgresTransaction(async (client) => {
    const before = await client.query<{ status: string; approval_status: string; title: string }>(
      `select status, approval_status, title
       from trip_activities
       where id = $2 and trip_id = $1
       limit 1`,
      [input.tripId, input.activityId]
    );

    const result = await client.query<TripActivitySummary>(
      `update trip_activities
       set status = $4, updated_by_user_id = $3, updated_at = now()
       where id = $2 and trip_id = $1
         and (
           created_by_user_id = $3
           or $5 in ('host', 'co_host')
           or approval_status = 'pending'
         )
       returning id::text, trip_day_id::text, title, status, approval_status,
         place_name_snapshot as place_name, start_time::text, end_time::text,
         price_snapshot::float8 as price_snapshot, created_by_user_id::text`,
      [input.tripId, input.activityId, input.userId, input.status, membership.role]
    );
    const activity = result.rows[0];
    if (!activity) return null;

    await client.query(
      `insert into trip_audit_logs (
         trip_id, actor_user_id, action, target_type, target_id, before_snapshot, after_snapshot
       )
       values ($1, $2, 'activity.status_updated', 'activity', $3, $4, $5)`,
      [
        input.tripId,
        input.userId,
        input.activityId,
        before.rows[0] ?? null,
        { status: activity.status, approval_status: activity.approval_status, title: activity.title },
      ]
    );

    return activity;
  });
}

export async function updateChecklistStatus(input: {
  tripId: string;
  itemId: string;
  userId: string;
  status: "todo" | "in_progress" | "done" | "blocked";
}): Promise<TripChecklistItem | null> {
  const membership = await getTripMembership(input);
  if (!membership || membership.role === "viewer") return null;

  const result = await query<TripChecklistItem>(
    `update trip_checklist_items
     set status = $4, updated_by_user_id = $3, updated_at = now()
     where id = $2 and trip_id = $1
       and (
         assigned_to_user_id = $3
         or created_by_user_id = $3
         or $5 in ('host', 'co_host')
       )
     returning id::text, title, category, status, due_date::text, assigned_to_user_id::text`,
    [input.tripId, input.itemId, input.userId, input.status, membership.role]
  );

  return result.rows[0] ?? null;
}

export async function createTripActivity(input: {
  tripId: string;
  userId: string;
  body: CreateTripActivityRequest;
}): Promise<TripActivitySummary | null> {
  const membership = await getTripMembership(input);
  if (!membership || !canWriteTrip(membership.role)) return null;

  const approvalStatus = approvalStatusForNewContribution(membership.role);
  const result = await query<TripActivitySummary>(
    `insert into trip_activities (
       trip_id, trip_day_id, place_id, title, notes, start_time, end_time,
       approval_status, created_by_user_id, updated_by_user_id,
       place_name_snapshot, address_snapshot, price_snapshot
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12)
     returning id::text, trip_day_id::text, title, status, approval_status,
       place_name_snapshot as place_name, start_time::text, end_time::text,
       price_snapshot::float8 as price_snapshot, created_by_user_id::text`,
    [
      input.tripId,
      input.body.trip_day_id ?? null,
      input.body.place_id ?? null,
      input.body.title,
      input.body.notes ?? null,
      input.body.start_time ?? null,
      input.body.end_time ?? null,
      approvalStatus,
      input.userId,
      input.body.place_name ?? null,
      input.body.address ?? null,
      input.body.price ?? null,
    ]
  );

  const activity = result.rows[0];
  if (!activity) return null;

  if (approvalStatus === "pending") {
    await query(
      `insert into trip_change_requests (trip_id, target_type, target_id, requested_by_user_id, change_payload, reason)
       values ($1, 'activity', $2, $3, $4, 'New contributor activity needs host review')`,
      [input.tripId, activity.id, input.userId, { title: activity.title }]
    );
  }

  await query(
    `insert into trip_audit_logs (trip_id, actor_user_id, action, target_type, target_id, after_snapshot)
     values ($1, $2, 'activity.created', 'activity', $3, $4)`,
    [
      input.tripId,
      input.userId,
      activity.id,
      {
        title: activity.title,
        approval_status: activity.approval_status,
        place_name: activity.place_name,
      },
    ]
  );

  return activity;
}

export async function createPlaceSubmission(input: {
  tripId: string;
  userId: string;
  body: CreatePlaceSubmissionRequest;
}): Promise<UserPlaceSubmissionSummary | null> {
  const membership = await getTripMembership(input);
  if (!membership || !canWriteTrip(membership.role)) return null;

  const result = await query<UserPlaceSubmissionSummary>(
    `insert into user_place_submissions (
       user_id, trip_id, raw_name, raw_type, raw_address, raw_notes, raw_price, raw_metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id::text, raw_name, raw_type, raw_address, raw_notes,
       raw_price::float8 as raw_price, status, created_at::text`,
    [
      input.userId,
      input.tripId,
      input.body.raw_name,
      input.body.raw_type ?? null,
      input.body.raw_address ?? null,
      input.body.raw_notes ?? null,
      input.body.raw_price ?? null,
      { activity_id: input.body.activity_id ?? null, source: "trip_detail_manual" },
    ]
  );

  const submission = result.rows[0];
  if (!submission) return null;

  if (!canModerateTrip(membership.role)) {
    await query(
      `insert into trip_change_requests (trip_id, target_type, target_id, requested_by_user_id, change_payload, reason)
       values ($1, 'place_submission', $2, $3, $4, 'New contributor place signal needs host review')`,
      [
        input.tripId,
        submission.id,
        input.userId,
        {
          raw_name: submission.raw_name,
          raw_type: submission.raw_type,
          raw_price: submission.raw_price,
        },
      ]
    );
  }

  await query(
    `insert into trip_audit_logs (trip_id, actor_user_id, action, target_type, target_id, after_snapshot)
     values ($1, $2, 'place_submission.created', 'place_submission', $3, $4)`,
    [
      input.tripId,
      input.userId,
      submission.id,
      {
        raw_name: submission.raw_name,
        raw_type: submission.raw_type,
        raw_price: submission.raw_price,
        status: submission.status,
      },
    ]
  );

  return submission;
}

export async function createTripExpense(input: {
  tripId: string;
  userId: string;
  body: CreateTripExpenseRequest;
}): Promise<TripExpenseSummary | null> {
  const membership = await getTripMembership(input);
  if (!membership || !canWriteTrip(membership.role)) return null;

  const approvalStatus = approvalStatusForNewContribution(membership.role);

  const expenseId = await withPostgresTransaction(async (client) => {
    const members = await client.query<{ user_id: string }>(
      `select user_id::text
       from trip_members
       where trip_id = $1 and status = 'active'`,
      [input.tripId]
    );
    const activeMemberIds = new Set(members.rows.map((member) => member.user_id));
    const splitUserIds = input.body.split_user_ids?.length
      ? input.body.split_user_ids
      : [...activeMemberIds];

    if (splitUserIds.some((userId) => !activeMemberIds.has(userId))) {
      return null;
    }

    const expenseResult = await client.query<{ id: string }>(
      `insert into expenses (
         trip_id, activity_id, place_id, paid_by_user_id, title, amount, currency,
         expense_type, approval_status, created_by_user_id, updated_by_user_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $4, $4)
       returning id::text`,
      [
        input.tripId,
        input.body.activity_id ?? null,
        input.body.place_id ?? null,
        input.userId,
        input.body.title,
        input.body.amount,
        input.body.currency ?? "VND",
        input.body.expense_type ?? "other",
        approvalStatus,
      ]
    );
    const expenseId = expenseResult.rows[0]?.id;
    if (!expenseId) return null;

    for (const split of buildEqualSplits({ amount: input.body.amount, userIds: splitUserIds })) {
      await client.query(
        `insert into expense_splits (expense_id, user_id, share_amount, share_percent, status)
         values ($1, $2, $3, $4, 'pending')
         on conflict (expense_id, user_id) do update
         set share_amount = excluded.share_amount,
             share_percent = excluded.share_percent,
             status = excluded.status`,
        [expenseId, split.userId, split.shareAmount, split.sharePercent]
      );
    }

    if (approvalStatus === "pending") {
      await client.query(
        `insert into trip_change_requests (trip_id, target_type, target_id, requested_by_user_id, change_payload, reason)
         values ($1, 'expense', $2, $3, $4, 'New contributor expense needs host review')`,
        [
          input.tripId,
          expenseId,
          input.userId,
          {
            title: input.body.title,
            amount: input.body.amount,
            activity_id: input.body.activity_id ?? null,
          },
        ]
      );
    }

    await client.query(
      `insert into trip_audit_logs (trip_id, actor_user_id, action, target_type, target_id, after_snapshot)
       values ($1, $2, 'expense.created', 'expense', $3, $4)`,
      [input.tripId, input.userId, expenseId, { approval_status: approvalStatus }]
    );

    return expenseId;
  });

  return expenseId ? getExpenseSummary(expenseId) : null;
}

async function getExpenseSummary(expenseId: string): Promise<TripExpenseSummary | null> {
  const expense = await query<TripExpenseSummary>(
    `select
       e.id::text,
       e.activity_id::text,
       e.place_id::text,
       e.title,
       e.amount::float8 as amount,
       e.currency,
       e.expense_type,
       e.approval_status,
       e.created_by_user_id::text,
       u.email::text as paid_by_email,
       p.current_name as place_name,
       ta.title as activity_title
     from expenses e
     left join users u on u.id = e.paid_by_user_id
     left join places p on p.id = e.place_id
     left join trip_activities ta on ta.id = e.activity_id
     where e.id = $1
     limit 1`,
    [expenseId]
  );
  const row = expense.rows[0];
  if (!row) return null;

  const splits = await query(
    `select
       es.id::text,
       es.user_id::text,
       u.email::text as email,
       coalesce(p.display_name, u.full_name) as display_name,
       es.share_amount::float8 as share_amount,
       es.share_percent::float8 as share_percent,
       es.status
     from expense_splits es
     join users u on u.id = es.user_id
     left join profiles p on p.user_id = u.id
     where es.expense_id = $1
     order by u.email`,
    [expenseId]
  );

  return {
    ...row,
    splits: splits.rows as TripExpenseSummary["splits"],
  };
}

export async function reviewTripChangeRequest(input: {
  tripId: string;
  requestId: string;
  userId: string;
  status: "approved" | "rejected";
}): Promise<TripChangeRequestSummary | null> {
  const membership = await getTripMembership(input);
  if (!membership || !canModerateTrip(membership.role)) return null;

  const reviewed = await withPostgresTransaction(async (client) => {
    const requestResult = await client.query<{
      id: string;
      target_type: string;
      target_id: string;
      requested_by_user_id: string;
      change_payload: Record<string, unknown>;
      status: "pending" | "approved" | "rejected";
    }>(
      `select
         id::text,
         target_type,
         target_id::text,
         requested_by_user_id::text,
         change_payload,
         status
       from trip_change_requests
       where id = $2 and trip_id = $1 and status = 'pending'
       for update`,
      [input.tripId, input.requestId]
    );
    const changeRequest = requestResult.rows[0];
    if (!changeRequest) return null;

    await applyReviewTargetUpdate(client, {
      tripId: input.tripId,
      reviewerId: input.userId,
      status: input.status,
      targetType: changeRequest.target_type,
      targetId: changeRequest.target_id,
    });

    const updatedRequest = await client.query<TripChangeRequestSummary>(
      `update trip_change_requests cr
       set status = $4,
           reviewed_by_user_id = $3,
           reviewed_at = now()
       from users u
       where cr.id = $2 and cr.trip_id = $1 and u.id = cr.requested_by_user_id
       returning
         cr.id::text,
         cr.target_type,
         cr.target_id::text,
         cr.requested_by_user_id::text,
         u.email::text as requested_by_email,
         cr.reviewed_by_user_id::text,
         (select reviewer.email::text from users reviewer where reviewer.id = cr.reviewed_by_user_id) as reviewed_by_email,
         cr.reviewed_at::text,
         cr.change_payload,
         cr.reason,
         cr.status,
         cr.created_at::text`,
      [input.tripId, input.requestId, input.userId, input.status]
    );

    await client.query(
      `insert into trip_audit_logs (trip_id, actor_user_id, action, target_type, target_id, after_snapshot)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        input.tripId,
        input.userId,
        `change_request.${input.status}`,
        changeRequest.target_type,
        changeRequest.target_id,
        { review_status: input.status, change_request_id: input.requestId },
      ]
    );

    return updatedRequest.rows[0] ?? null;
  });

  return reviewed;
}

async function applyReviewTargetUpdate(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  input: {
    tripId: string;
    reviewerId: string;
    status: "approved" | "rejected";
    targetType: string;
    targetId: string;
  }
) {
  if (input.targetType === "activity") {
    await client.query(
      `update trip_activities
       set approval_status = $4,
           approved_by_user_id = case when $4 = 'approved' then $3::uuid else approved_by_user_id end,
           updated_by_user_id = $3,
           updated_at = now()
       where id = $2 and trip_id = $1`,
      [input.tripId, input.targetId, input.reviewerId, input.status]
    );
    return;
  }

  if (input.targetType === "expense") {
    await client.query(
      `update expenses
       set approval_status = $4,
           approved_by_user_id = case when $4 = 'approved' then $3::uuid else approved_by_user_id end,
           updated_by_user_id = $3,
           updated_at = now()
       where id = $2 and trip_id = $1`,
      [input.tripId, input.targetId, input.reviewerId, input.status]
    );
    return;
  }

  if (input.targetType === "place_submission") {
    await client.query(
      `update user_place_submissions
       set status = case when $3 = 'approved' then 'normalized' else 'rejected' end
       where id = $2 and trip_id = $1`,
      [input.tripId, input.targetId, input.status]
    );
  }
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
