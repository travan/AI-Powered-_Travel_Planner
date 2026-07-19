import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import type { ReviewDecision, ReviewEntityType } from "../domain/review.entity.js";

export class ReviewTripParamsDto {
  @IsUUID()
  tripId!: string;
}

export class ReviewSubmissionDto {
  @IsIn(["activity", "bill", "expense", "place_signal"])
  entity_type!: ReviewEntityType;

  @IsUUID()
  entity_id!: string;

  @IsIn(["approved", "rejected"])
  decision!: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
