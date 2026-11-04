// Isolated Google transport fake for browser tests; never imported by the application.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const { generateKeyPair, SignJWT, exportJWK } = await import(
  require.resolve("jose")
);
const database = process.env.E2E_POSTGRES_URL;
if (
  process.env.NODE_ENV !== "test" ||
  !database ||
  !["127.0.0.1", "localhost"].includes(new URL(database).hostname) ||
  !/test|e2e/.test(new URL(database).pathname)
)
  throw new Error("Isolated local test database required");
Object.assign(process.env, {
  DOCUMENT_STORE: "postgres",
  DATABASE_PROVIDER: "postgres",
  AUTH_PROVIDER: "local",
  POSTGRES_URL: database,
  JWT_SECRET: "google-e2e-isolated-secret-at-least-32-chars",
  GOOGLE_AUTH_ENABLED: "true",
  GOOGLE_CLIENT_ID: "google-e2e",
  GOOGLE_CLIENT_SECRET: "test-only",
  GOOGLE_REDIRECT_URI: "http://127.0.0.1:3219/api/auth/google/callback",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3219",
  CORS_ORIGINS: "http://127.0.0.1:3219",
  RATE_LIMIT_MAX: "10000",
});
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "e2e" };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://www.googleapis.com/oauth2/v3/certs")
    return Response.json({ keys: [jwk] });
  if (String(url) === "https://oauth2.googleapis.com/token") {
    const code = new URLSearchParams(init.body).get("code");
    if (code === "invalid")
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    const profile = JSON.parse(Buffer.from(code, "base64url").toString());
    const id_token = await new SignJWT({
      sub: profile.sub,
      email: profile.email,
      email_verified: true,
      nonce: profile.nonce,
      name: "Google E2E",
    })
      .setProtectedHeader({ alg: "RS256", kid: "e2e" })
      .setIssuer("https://accounts.google.com")
      .setAudience("google-e2e")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    return Response.json({ id_token });
  }
  return originalFetch(url, init);
};
const { buildApp } = await import("../apps/server/dist/app.js");
const app = await buildApp();
await app.listen(3319, "127.0.0.1");
