import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches } from "class-validator";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CitySearchQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  q = "";
}

export class CitySlugParamsDto {
  @Transform(trimString)
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}
