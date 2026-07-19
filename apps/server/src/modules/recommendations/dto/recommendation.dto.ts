import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export const transportModes = [
  "flight",
  "train",
  "bus",
  "ferry",
  "car",
  "motorbike",
  "bicycle",
  "walking",
  "other",
] as const;

function trimOptionalString({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class PlaceRecommendationQueryDto {
  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  citySlug?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class TransportRecommendationQueryDto {
  @Transform(trimOptionalString)
  @IsOptional()
  @IsIn(transportModes)
  mode?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  originCity?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  destinationCity?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
