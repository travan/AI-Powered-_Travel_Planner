import { Transform, Type } from "class-transformer";
import { IsInt, IsString, Max, Min, MinLength } from "class-validator";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class UserIdParamsDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  id!: string;
}

export class PromptHistoryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
