import { describe, expect, it } from "vitest";
import {
  createPlaceSubmissionDto,
  createTripActivityDto,
  createTripExpenseDto,
  changeRequestReviewParamsDto,
  reviewTripChangeRequestDto,
  tripIdParamsDto,
} from "./trip.dto";

describe("trip DTO validation", () => {
  it("validates route params as UUIDs", () => {
    expect(tripIdParamsDto.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(
      tripIdParamsDto.safeParse({ id: "9f2e7c70-1d5e-46f4-87c4-75e3b4e7a201" }).success
    ).toBe(true);
  });

  it("normalizes activity payload and coerces numeric fields", () => {
    const parsed = createTripActivityDto.parse({
      title: "  Sunset basket boat  ",
      place_name: "  Cam Thanh  ",
      address: "",
      price: "600000",
    });

    expect(parsed).toMatchObject({
      title: "Sunset basket boat",
      place_name: "Cam Thanh",
      address: undefined,
      price: 600000,
    });
  });

  it("normalizes place submissions used as reusable data signals", () => {
    const parsed = createPlaceSubmissionDto.parse({
      raw_name: "  Hidden Mango Cafe  ",
      raw_type: " cafe ",
      raw_price: "65000",
      raw_notes: "",
    });

    expect(parsed).toMatchObject({
      raw_name: "Hidden Mango Cafe",
      raw_type: "cafe",
      raw_price: 65000,
      raw_notes: undefined,
    });
  });

  it("validates shared expense contract", () => {
    const parsed = createTripExpenseDto.parse({
      title: "  Dinner bill  ",
      amount: "980000",
      currency: "vnd",
      expense_type: "food",
      split_user_ids: ["9f2e7c70-1d5e-46f4-87c4-75e3b4e7a201"],
    });

    expect(parsed).toMatchObject({
      title: "Dinner bill",
      amount: 980000,
      currency: "VND",
      expense_type: "food",
    });
    expect(createTripExpenseDto.safeParse({ title: "Bad", amount: -1 }).success).toBe(false);
  });

  it("validates host review change request contracts", () => {
    expect(
      changeRequestReviewParamsDto.safeParse({
        id: "9f2e7c70-1d5e-46f4-87c4-75e3b4e7a201",
        requestId: "16934421-5581-4549-a9e1-5af9784d30f7",
      }).success
    ).toBe(true);
    expect(reviewTripChangeRequestDto.safeParse({ status: "approved" }).success).toBe(true);
    expect(reviewTripChangeRequestDto.safeParse({ status: "pending" }).success).toBe(false);
  });
});
