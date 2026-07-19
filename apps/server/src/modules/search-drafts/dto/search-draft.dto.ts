import { Transform } from "class-transformer";
import { IsEmail, IsObject, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimOptionalEmail({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed || undefined;
}

export class CreateSearchDraftDto {
  @Transform(trimString)
  @IsString()
  @MinLength(12)
  guest_key!: string;

  @Transform(trimOptionalEmail)
  @IsOptional()
  @IsEmail()
  email_hint?: string;

  @Transform(trimString)
  @IsString()
  @MinLength(3)
  prompt_text!: string;

  @IsOptional()
  @IsObject()
  search_payload: Record<string, unknown> = {};
}

export class ClaimSearchDraftDto {
  @Transform(trimString)
  @IsString()
  @MinLength(12)
  guest_key!: string;
}

export class SearchDraftParamsDto {
  @IsUUID()
  id!: string;
}
