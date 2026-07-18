import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { TransportMode } from "../domain/transport.entity.js";

export const transportModes: TransportMode[] = [
  "flight",
  "train",
  "bus",
  "ferry",
  "car",
  "motorbike",
  "bicycle",
  "walking",
  "other",
];

function trimOptionalString({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class TransportTripParamsDto {
  @IsUUID()
  tripId!: string;
}

export class TransportBookingParamsDto extends TransportTripParamsDto {
  @IsUUID()
  bookingId!: string;
}

export class CreateTransportBookingDto {
  @IsOptional()
  @IsUUID()
  activity_id?: string;

  @IsIn(transportModes)
  mode!: TransportMode;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  provider_name?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  booking_reference?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  origin_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  destination_name!: string;

  @IsOptional()
  @IsDateString()
  departure_at?: string;

  @IsOptional()
  @IsDateString()
  arrival_at?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency = "VND";

  @IsIn(["planned", "reserved", "ticketed", "completed", "cancelled"])
  booking_status = "planned";

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  participant_user_ids?: string[];
}

export class UpdateTransportBookingDto {
  @IsOptional()
  @IsUUID()
  activity_id?: string;

  @IsOptional()
  @IsIn(transportModes)
  mode?: TransportMode;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  provider_name?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  booking_reference?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  origin_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  destination_name?: string;

  @IsOptional()
  @IsDateString()
  departure_at?: string;

  @IsOptional()
  @IsDateString()
  arrival_at?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsIn(["planned", "reserved", "ticketed", "completed", "cancelled"])
  booking_status?: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  participant_user_ids?: string[];
}
