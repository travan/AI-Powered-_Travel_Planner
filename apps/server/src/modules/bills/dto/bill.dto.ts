import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";

export class BillIdParamsDto {
  @IsUUID()
  id!: string;
}

export class BillTripParamsDto {
  @IsUUID()
  tripId!: string;
}

export class CreateBillDto {
  @IsOptional()
  @IsUUID()
  activity_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  storage_url?: string;

  @IsOptional()
  @IsString()
  raw_text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_amount?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency = "VND";

  @IsOptional()
  @IsString()
  @MaxLength(160)
  merchant_name?: string;

  @IsOptional()
  @IsDateString()
  bill_issued_at?: string;
}

export class UpdateBillDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  storage_url?: string;

  @IsOptional()
  @IsString()
  raw_text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_amount?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  merchant_name?: string;

  @IsOptional()
  @IsDateString()
  bill_issued_at?: string;

  @IsOptional()
  @IsIn(["draft", "uploaded", "ocr_pending", "ocr_processed", "approved", "rejected"])
  status?: string;
}
