import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

function trimOptionalString({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class ActivityCatalogQueryDto {
  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  citySlug?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  category?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  q?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class TripActivityParamsDto {
  @IsUUID()
  tripId!: string;
}

export class TripActivityIdParamsDto extends TripActivityParamsDto {
  @IsUUID()
  activityId!: string;
}

export class TripActivityParticipantParamsDto extends TripActivityIdParamsDto {
  @IsUUID()
  userId!: string;
}

export class CreateTripActivityDto {
  @IsOptional() @IsString() @MaxLength(160) source_plan_item_id?: string;
  @IsOptional()
  @IsUUID()
  activity_catalog_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category = "activity";

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimated_cost?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency = "VND";
}

export class UpdateTripActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimated_cost?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsIn([
    "pending_review",
    "approved",
    "rejected",
    "scheduled",
    "done",
    "cancelled",
  ])
  status?: string;
}

export class UpdateActivityParticipantDto {
  @IsIn(["joined", "declined", "maybe"])
  status!: "joined" | "declined" | "maybe";
}
