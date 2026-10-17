import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

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
  @Matches(/^[\p{L}\p{N}-]+$/u)
  slug!: string;
}

export class RememberCityDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/[\p{L}\p{N}]/u)
  name!: string;
}
