import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class RequirementDto {
  @IsString() @MinLength(1) @MaxLength(250) value!: string;
  @IsIn(["required", "preferred"]) priority!: "required" | "preferred";
}
export class LocationDto {
  @IsString() @MaxLength(250) label!: string;
  @IsOptional() @IsString() @MaxLength(120) city_slug?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsNumber() @Min(0) accuracy_m?: number;
  @IsIn(["manual", "browser", "catalog"]) source!:
    | "manual"
    | "browser"
    | "catalog";
}
class JourneyDto {
  @IsDefined() @ValidateNested() @Type(() => LocationDto) origin!: LocationDto;
  @IsBoolean() return_to_origin!: boolean;
  @IsOptional()
  @IsDefined()
  @ValidateNested()
  @Type(() => LocationDto)
  endpoint?: LocationDto;
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  destinations!: string[];
  @IsIn(["Asia/Ho_Chi_Minh"]) timezone!: "Asia/Ho_Chi_Minh";
}
class TravelersDto {
  @IsInt() @Min(1) @Max(20) adults!: number;
  @IsArray()
  @ArrayMaxSize(19)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  child_ages!: number[];
}
class BudgetDto {
  @IsOptional() @IsNumber() @Min(1) total?: number;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
}
class TransportPreferencesDto {
  @IsIn(["suggest", "flight", "train", "bus", "car", "motorbike", "ferry"])
  mode!: string;
  @IsOptional()
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/,
  )
  arrival_at?: string;
  @IsOptional()
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/,
  )
  departure_at?: string;
  @IsInt() @Min(30) @Max(360) airport_buffer_minutes!: number;
  @IsBoolean() confirmed!: boolean;
  @IsOptional() @IsString() @MaxLength(160) provider?: string;
  @IsOptional() @IsString() @MaxLength(120) booking_reference?: string;
  @IsOptional() @IsNumber() @Min(0) total_price?: number;
}
class StayPreferencesDto {
  @IsIn([
    "suggest",
    "hotel",
    "homestay",
    "apartment",
    "resort",
    "hostel",
    "already_booked",
    "none",
  ])
  type!: string;
  @IsInt() @Min(1) @Max(20) rooms!: number;
  @IsOptional() @IsNumber() @Min(0) nightly_budget?: number;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RequirementDto)
  requirements!: RequirementDto[];
  @IsOptional() @IsString() @MaxLength(200) booked_name?: string;
  @IsOptional() @IsString() @MaxLength(120) booking_reference?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) check_in?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) check_out?: string;
}
class DiningPreferencesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RequirementDto)
  requirements!: RequirementDto[];
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  allergies!: string[];
  @IsOptional() @IsNumber() @Min(0) per_person_budget?: number;
  @IsString() @MaxLength(250) cafe!: string;
  @IsBoolean() independent_only!: boolean;
}
class ExperiencePreferencesDto {
  @IsIn(["relaxed", "balanced", "packed"]) pace!:
    | "relaxed"
    | "balanced"
    | "packed";
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  interests!: string[];
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RequirementDto)
  requirements!: RequirementDto[];
}
export class PlanningCriteriaDto {
  @IsIn([2]) schema_version!: 2;
  @IsDefined() @ValidateNested() @Type(() => JourneyDto) journey!: JourneyDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => TravelersDto)
  travelers!: TravelersDto;
  @IsDefined() @ValidateNested() @Type(() => BudgetDto) budget!: BudgetDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => TransportPreferencesDto)
  transport_preferences!: TransportPreferencesDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => StayPreferencesDto)
  stay_preferences!: StayPreferencesDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => DiningPreferencesDto)
  dining_preferences!: DiningPreferencesDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => ExperiencePreferencesDto)
  experience_preferences!: ExperiencePreferencesDto;
}
export class ResolveLocationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) query?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}
export class TripJourneyParamsDto {
  @IsUUID() tripId!: string;
}
export class AccommodationParamsDto extends TripJourneyParamsDto {
  @IsUUID() id!: string;
}
export class JobParamsDto {
  @IsUUID() jobId!: string;
}
export class RevisionParamsDto extends TripJourneyParamsDto {
  @IsUUID() revisionId!: string;
}
export class AccommodationDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MaxLength(120) city = "";
  @IsInt() @Min(1) @Max(20) rooms = 1;
  @IsInt() @Min(1) @Max(20) guests = 2;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) check_in_date?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) check_out_date?: string;
  @IsOptional() @IsNumber() @Min(0) price_per_night?: number;
  @IsString() @Matches(/^[A-Z]{3}$/) currency = "VND";
  @IsIn(["planned", "selected", "booked", "cancelled", "completed"])
  booking_status:
    | "planned"
    | "selected"
    | "booked"
    | "cancelled"
    | "completed" = "selected";
  @IsOptional() @IsString() @MaxLength(160) booking_provider?: string;
  @IsOptional() @IsString() @MaxLength(120) booking_reference?: string;
  @IsOptional() @IsString() @MaxLength(200) room_type?: string;
  @IsOptional() @IsString() @MaxLength(1000) cancellation_policy?: string;
  @IsOptional() @IsString() @MaxLength(1000) booking_url?: string;
  @IsBoolean() locked = false;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class RevisionDto {
  @IsIn(["day", "meal", "stay", "restore"]) scope!:
    | "day"
    | "meal"
    | "stay"
    | "restore";
  @IsOptional() @IsString() @MaxLength(160) target_id?: string;
  @IsOptional() @IsUUID() restore_revision_id?: string;
  @IsString() @MaxLength(2000) instruction = "";
  @IsInt() @Min(1) expected_version!: number;
}
export class ApplyRevisionDto {
  @IsInt() @Min(1) expected_version!: number;
}
export class PlanningChecklistUpdateDto {
  @IsUUID() id!: string;
  @IsIn(["todo", "done"]) status!: string;
  @IsIn(["todo", "in_progress", "done", "blocked"]) expected_status!: string;
}
export class LockPlanDto extends ApplyRevisionDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  locked_ids!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique((item: PlanningChecklistUpdateDto | null) => item?.id)
  @ValidateNested({ each: true })
  @Type(() => PlanningChecklistUpdateDto)
  checklist_updates?: PlanningChecklistUpdateDto[];
}

export class ChecklistStatusDto {
  @IsIn(["todo", "in_progress", "done", "blocked"]) status!: string;
}

export class TranslationDto {
  @IsIn(["en", "vi"]) target_locale!: "en" | "vi";
  @IsString() @Matches(/^[a-f0-9]{64}$/) source_version!: string;
}
export class TranslationParamsDto {
  @IsUUID() id!: string;
  @IsOptional() @IsIn(["en", "vi"]) locale?: "en" | "vi";
}
export class TripTranslationParamsDto extends TripJourneyParamsDto {
  @IsOptional() @IsIn(["en", "vi"]) locale?: "en" | "vi";
}
