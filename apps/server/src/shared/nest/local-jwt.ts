import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service.js";

type JwtPayload = Record<string, unknown> & {
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
};

export type JwtSigner = {
  sign: (payload: Record<string, unknown>, options: { expiresIn: number }) => string;
};

@Injectable()
export class LocalJwtService implements JwtSigner {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  sign(payload: Record<string, unknown>, options: { expiresIn: number }): string {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64UrlJson({ alg: "HS256", typ: "JWT" })}.${base64UrlJson({
      ...payload,
      iat: now,
      exp: now + options.expiresIn,
    })}`;
    return `${unsigned}.${this.signUnsigned(unsigned)}`;
  }

  verify(token: string): JwtPayload | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = this.signUnsigned(unsigned);
    if (!safeEqual(signature, expectedSignature)) return null;

    const payload = parseBase64UrlJson(encodedPayload);
    if (!payload || typeof payload !== "object") return null;

    const record = payload as JwtPayload;
    if (typeof record.exp === "number" && record.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return record;
  }

  private signUnsigned(unsigned: string): string {
    return createHmac("sha256", this.config.jwtSecret).update(unsigned).digest("base64url");
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64UrlJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
