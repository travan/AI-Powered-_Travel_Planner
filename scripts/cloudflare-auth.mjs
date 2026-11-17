import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** CI uses its explicit secret; local deployment can reuse `wrangler login`. */
export async function cloudflareApiToken({
  env = process.env,
  run = execute,
} = {}) {
  const configured = env.CLOUDFLARE_API_TOKEN?.trim();
  if (configured) return configured;
  try {
    // Capture stdout: it contains credentials and must never reach logs/artifacts.
    const { stdout } = await run(
      "pnpm",
      ["dlx", "wrangler@4.155.0", "auth", "token", "--json"],
      { env, timeout: 60_000, maxBuffer: 256 * 1024 },
    );
    const result = JSON.parse(stdout);
    if (
      ["oauth", "api_token"].includes(result?.type) &&
      typeof result.token === "string" &&
      result.token.trim()
    ) {
      return result.token.trim();
    }
  } catch {
    // Do not propagate CLI output: it can contain account credentials.
  }
  throw new Error(
    "Cloudflare credentials unavailable. Set CLOUDFLARE_API_TOKEN or run pnpm dlx wrangler@4.155.0 login.",
  );
}
