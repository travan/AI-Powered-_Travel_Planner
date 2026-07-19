import { z } from "zod";

const uuid = z.string().uuid();
const cleanText = z.string().trim();
const optionalText = cleanText.transform((value) => value || undefined).optional();
const currency = cleanText.length(3).toUpperCase().default("VND");

export const billIdParamsDto = z.object({
  id: uuid,
});

export const createBillUploadParamsDto = z.object({
  id: uuid,
});

export const createBillUploadDto = z.object({
  raw_ocr_text: cleanText.min(5).max(20_000),
  storage_url: optionalText.default("local://manual-ocr-entry"),
  place_id: uuid.nullable().optional(),
  activity_id: uuid.nullable().optional(),
  place_name: optionalText,
  place_address: optionalText,
  place_type: z
    .enum(["hotel", "homestay", "cafe", "restaurant", "attraction", "activity", "transport_hub", "shop", "other"])
    .default("restaurant"),
  city_slug: optionalText,
  total_amount: z.coerce.number().positive().optional(),
  currency,
  bill_date: z.string().datetime().optional(),
  create_expense: z.coerce.boolean().default(true),
  split_user_ids: z.array(uuid).min(1).max(50).optional(),
});

export type BillIdParamsDto = z.infer<typeof billIdParamsDto>;
export type CreateBillUploadParamsDto = z.infer<typeof createBillUploadParamsDto>;
export type CreateBillUploadDto = z.infer<typeof createBillUploadDto>;
