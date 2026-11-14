import { PlanningCriteriaDto } from "../journey/journey.dto.js";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from "class-validator";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class ItineraryIdParamsDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  id!: string;
}

class DestinationReferenceDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @IsIn(["city", "country"])
  kind!: "city" | "country";
}

export class GenerateItineraryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  flexible_month?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlanningCriteriaDto)
  planning?: PlanningCriteriaDto;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  cities!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  city_names?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DestinationReferenceDto)
  destination_refs?: DestinationReferenceDto[];

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  num_days?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  budget?: number;

  @IsString()
  currency!: string;

  @IsString()
  @IsIn([
    "adventure",
    "relax",
    "culture",
    "food",
    "mixed",
    "budget",
    "mid_range",
    "luxury",
    "family",
    "romantic",
    "cultural",
  ])
  trip_style!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  num_travelers!: number;

  @IsOptional()
  @IsIn(["en", "vi"])
  locale?: "en" | "vi";

  @IsOptional()
  @IsString()
  prompt_text?: string;

  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}
