import {
  IsUUID,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
export class LearningSettingsDto {
  @IsOptional() @IsBoolean() memory_enabled?: boolean;
  @IsOptional() @IsBoolean() training_consent?: boolean;
}
export class PlannerFeedbackDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class LearningTripParamsDto {
  @IsUUID() tripId!: string;
}

export class LearningItineraryParamsDto {
  @IsUUID() id!: string;
}
