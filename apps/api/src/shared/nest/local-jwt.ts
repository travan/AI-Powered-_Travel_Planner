import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../env.js";

type JwtPayload = Record<string, unknown> & {
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
};

export type JwtSigner = {
  sign: (payload: Record<string, unknown>, options: { expiresIn: number }) => string;
};

export const localJwtSigner: JwtSigner = {
  sign: (payload, options) => signJwt(payload, options.expiresIn),
};

export function signJwt(payload: Record<string, unknown>, expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(unsigned);
  if (!safeEqual(signature, expectedSignature)) return null;

  const payload = parseBase64UrlJson(encodedPayload);
  if (!payload || typeof payload !== "object") return null;

  const record = payload as JwtPayload;
  if (typeof record.exp === "number" && record.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return record;
}

function sign(unsigned: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(unsigned)
    .digest("base64url");
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
