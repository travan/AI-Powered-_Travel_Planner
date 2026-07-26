import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class ExpenseTripParamsDto {
  @IsUUID()
  tripId!: string;
}

export class ExpenseParamsDto extends ExpenseTripParamsDto {
  @IsUUID()
  expenseId!: string;
}

export class ExpenseSplitParamsDto extends ExpenseParamsDto {
  @IsUUID()
  splitId!: string;
}

export class ExpenseSplitInputDto {
  @IsUUID()
  user_id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency = "VND";

  @IsOptional()
  @IsUUID()
  paid_by_user_id?: string;

  @IsOptional()
  @IsUUID()
  activity_id?: string;

  @IsOptional()
  @IsUUID()
  bill_upload_id?: string;

  @IsIn(["equal", "custom"])
  split_strategy: "equal" | "custom" = "equal";

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  participant_user_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitInputDto)
  splits?: ExpenseSplitInputDto[];
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsUUID()
  paid_by_user_id?: string;

  @IsOptional()
  @IsUUID()
  activity_id?: string;

  @IsOptional()
  @IsUUID()
  bill_upload_id?: string;

  @IsOptional()
  @IsIn(["pending_review", "approved", "rejected", "void"])
  status?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitInputDto)
  splits?: ExpenseSplitInputDto[];
}

export class UpdateExpenseSplitStatusDto {
  @IsIn(["owed", "settled", "waived"])
  status!: "owed" | "settled" | "waived";
}
