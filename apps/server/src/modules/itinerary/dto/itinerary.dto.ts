import { Transform } from "class-transformer";
import { IsString, MinLength } from "class-validator";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class ItineraryIdParamsDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  id!: string;
}
