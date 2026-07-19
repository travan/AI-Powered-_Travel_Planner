import { expect, test, type APIRequestContext } from "@playwright/test";
import { API_BASE_URL, apiAuthHeaders, apiJsonHeaders } from "./helpers/e2e-helpers";

const tripId = "11111111-1111-4111-8111-111111111111";
const hostToken = "Bearer e2e-user-1";
const guestToken = "Bearer e2e-user-2";
const friendToken = "Bearer e2e-user-3";

test.describe("trip business contract flows", () => {
  test.beforeEach(async ({ request }) => {
    const reset = await request.post(`${API_BASE_URL}/__e2e/reset-business-fixtures`);
    expect(reset.ok()).toBeTruthy();
  });

  test("covers group, schedule, transport, bill, split, and audit contracts", async ({ request }) => {
    const initialMembers = await getJson(request, `/api/trips/${tripId}/members`);
    expect(initialMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "e2e-user-1", role: "host", status: "active" }),
        expect.objectContaining({ userId: "e2e-user-2", role: "viewer", status: "active" }),
      ])
    );

    const invite = await postJson(request, `/api/trips/${tripId}/invites`, {
      email: "friend@example.com",
      role: "editor",
      expiresInDays: 7,
    });
    expect(invite).toEqual(expect.objectContaining({ role: "editor", status: "pending" }));

    const joinedInviteMember = await postJson(request, "/api/trips/join/invite", { token: invite.token }, friendToken);
    expect(joinedInviteMember).toEqual(expect.objectContaining({ userId: "e2e-user-3", role: "editor" }));

    const shareLink = await patchJson(request, `/api/trips/${tripId}/share-link`, {
      enabled: true,
      role: "viewer",
    });
    expect(shareLink.shareToken).toContain("share-token");

    const joinedShareMember = await postJson(request, "/api/trips/join/share-link", { token: shareLink.shareToken }, guestToken);
    expect(joinedShareMember).toEqual(expect.objectContaining({ userId: "e2e-user-2", status: "active" }));

    const updatedMember = await patchJson(request, `/api/trips/${tripId}/members/e2e-user-3`, { role: "admin" });
    expect(updatedMember).toEqual(expect.objectContaining({ userId: "e2e-user-3", role: "admin" }));

    const catalog = await getJson(request, "/api/activities/catalog?citySlug=hoi-an&q=lantern");
    expect(catalog[0]).toEqual(expect.objectContaining({ canonicalName: "Hoi An lantern workshop" }));

    const activity = await postJson(request, `/api/trips/${tripId}/activities`, {
      activity_catalog_id: catalog[0].id,
      title: "Lantern workshop",
      category: "workshop",
      scheduled_at: "2026-08-11T09:00:00.000Z",
      location_name: "Hoi An Old Town",
      address: "Old Town, Hoi An",
      estimated_cost: 300000,
      currency: "VND",
    });
    expect(activity).toEqual(expect.objectContaining({ title: "Lantern workshop", status: "approved" }));

    const participant = await patchJson(
      request,
      `/api/trips/${tripId}/activities/${activity.id}/participants/e2e-user-2`,
      { status: "joined" },
      guestToken
    );
    expect(participant).toEqual(expect.objectContaining({ activityId: activity.id, userId: "e2e-user-2", status: "joined" }));

    const transport = await postJson(request, `/api/trips/${tripId}/transport-bookings`, {
      activity_id: activity.id,
      mode: "train",
      provider_name: "Vietnam Railways",
      booking_reference: "SE22-ABC",
      origin_name: "Da Nang Station",
      destination_name: "Hoi An Shuttle Point",
      departure_at: "2026-08-11T07:30:00.000Z",
      arrival_at: "2026-08-11T08:30:00.000Z",
      price: 120000,
      currency: "VND",
      booking_status: "ticketed",
      participant_user_ids: ["e2e-user-1", "e2e-user-2"],
    });
    expect(transport).toEqual(expect.objectContaining({ mode: "train", bookingStatus: "ticketed" }));
    expect(transport.participantUserIds).toEqual(["e2e-user-1", "e2e-user-2"]);

    const updatedTransport = await patchJson(request, `/api/trips/${tripId}/transport-bookings/${transport.id}`, {
      booking_status: "completed",
      price: 110000,
    });
    expect(updatedTransport).toEqual(expect.objectContaining({ bookingStatus: "completed", price: 110000 }));

    const bill = await postJson(request, `/api/trips/${tripId}/bills`, {
      activity_id: activity.id,
      raw_text: "Lantern workshop bill total 600000 VND",
      total_amount: 600000,
      currency: "VND",
      merchant_name: "Hoi An Lantern Studio",
    });
    expect(bill).toEqual(expect.objectContaining({ activityId: activity.id, totalAmount: 600000 }));

    const updatedBill = await patchJson(request, `/api/bills/${bill.id}`, {
      status: "ocr_processed",
      merchant_name: "Hoi An Lantern Studio Updated",
    });
    expect(updatedBill).toEqual(expect.objectContaining({ status: "ocr_processed", merchantName: "Hoi An Lantern Studio Updated" }));

    const expense = await postJson(request, `/api/trips/${tripId}/expenses`, {
      activity_id: activity.id,
      bill_upload_id: bill.id,
      title: "Lantern workshop group payment",
      amount: 600000,
      currency: "VND",
      paid_by_user_id: "e2e-user-1",
      split_strategy: "custom",
      splits: [
        { user_id: "e2e-user-1", amount: 300000 },
        { user_id: "e2e-user-2", amount: 300000 },
      ],
    });
    expect(expense).toEqual(expect.objectContaining({ activityId: activity.id, billUploadId: bill.id }));
    expect(expense.splits).toHaveLength(2);
    expect(expense.splits[0]).toEqual(expect.objectContaining({ activityId: activity.id, status: "owed" }));

    const updatedExpense = await patchJson(request, `/api/trips/${tripId}/expenses/${expense.id}`, {
      title: "Lantern workshop confirmed payment",
      status: "approved",
    });
    expect(updatedExpense).toEqual(expect.objectContaining({ title: "Lantern workshop confirmed payment", status: "approved" }));

    const settledSplit = await patchJson(
      request,
      `/api/trips/${tripId}/expenses/${expense.id}/splits/${expense.splits[1].id}`,
      { status: "settled" },
      guestToken
    );
    expect(settledSplit).toEqual(expect.objectContaining({ status: "settled", userId: "e2e-user-2" }));
    expect(settledSplit.settledAt).toBeTruthy();

    const activities = await getJson(request, `/api/trips/${tripId}/activities`);
    expect(activities[0].participants).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: "e2e-user-2", status: "joined" })])
    );

    const transports = await getJson(request, `/api/trips/${tripId}/transport-bookings`);
    expect(transports).toEqual(expect.arrayContaining([expect.objectContaining({ id: transport.id, bookingStatus: "completed" })]));

    const expenses = await getJson(request, `/api/trips/${tripId}/expenses`);
    expect(expenses).toEqual(expect.arrayContaining([expect.objectContaining({ id: expense.id, status: "approved" })]));

    const auditLogs = await getJson(request, `/api/trips/${tripId}/audit-logs`);
    expect(auditLogs.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining(["created", "accepted", "share_link_enabled", "updated", "participant_joined", "status_settled"])
    );
  });

  test("rejects invalid custom expense split total", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/trips/${tripId}/expenses`, {
      headers: apiJsonHeaders(hostToken),
      data: {
        title: "Invalid split",
        amount: 600000,
        currency: "VND",
        split_strategy: "custom",
        splits: [{ user_id: "e2e-user-1", amount: 100000 }],
      },
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ message: "Custom split total must equal expense amount" }));
  });

  test("blocks non-host member management", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/trips/${tripId}/invites`, {
      headers: apiJsonHeaders(guestToken),
      data: { email: "blocked@example.com", role: "viewer" },
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Forbidden" }));
  });
});

async function getJson(request: APIRequestContext, path: string, token = hostToken) {
  const response = await request.get(`${API_BASE_URL}${path}`, { headers: apiAuthHeaders(token) });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function postJson(request: APIRequestContext, path: string, data: unknown, token = hostToken) {
  const response = await request.post(`${API_BASE_URL}${path}`, { headers: apiJsonHeaders(token), data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function patchJson(request: APIRequestContext, path: string, data: unknown, token = hostToken) {
  const response = await request.patch(`${API_BASE_URL}${path}`, { headers: apiJsonHeaders(token), data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
