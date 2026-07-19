import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

function normalizeEmail({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function trimOptionalString({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class AccountExistsQueryDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;
}

export class SignupDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @Transform(trimOptionalString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  full_name?: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
