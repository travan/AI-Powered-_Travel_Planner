import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

const roles = ["host", "admin", "editor", "viewer"] as const;
const memberStatuses = ["active", "removed", "left"] as const;

function normalizeEmail({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed || undefined;
}

export class TripIdParamsDto {
  @IsUUID()
  id!: string;
}

export class TripMemberParamsDto extends TripIdParamsDto {
  @IsUUID()
  userId!: string;
}

export class TripAuditLogQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class CreateTripInviteDto {
  @Transform(normalizeEmail)
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(roles)
  role: "admin" | "editor" | "viewer" = "viewer";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays = 7;
}

export class JoinTripInviteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(12)
  token!: string;
}

export class UpdateTripShareLinkDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(["editor", "viewer"])
  role: "editor" | "viewer" = "viewer";
}

export class JoinTripShareLinkDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(12)
  token!: string;
}

export class UpdateTripMemberDto {
  @IsOptional()
  @IsIn(roles)
  role?: "host" | "admin" | "editor" | "viewer";

  @IsOptional()
  @IsIn(memberStatuses)
  status?: "active" | "removed" | "left";
}
