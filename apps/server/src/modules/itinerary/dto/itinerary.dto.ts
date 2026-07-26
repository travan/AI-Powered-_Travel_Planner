import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
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

export class GenerateItineraryDto {
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
  @IsIn(["adventure", "relax", "culture", "food", "mixed", "budget", "mid_range", "luxury", "family", "romantic", "cultural"])
  trip_style!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  num_travelers!: number;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  prompt_text?: string;
}
