import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = "apps/web/.next/static";
const secret = process.env.JWT_SECRET;
if (!secret?.startsWith("security-ci-server-only-sentinel-"))
  throw new Error("Use a dedicated fake secret for the bundle check.");
const files = (await readdir(root, { recursive: true })).filter((file) =>
  /\.(js|map)$/.test(file),
);
if (!files.length) throw new Error("No Next.js assets found.");
for (const file of files) {
  if (file.endsWith(".map")) throw new Error("Public source map found.");
  if ((await readFile(path.join(root, file), "utf8")).includes(secret))
    throw new Error("Server secret canary found in browser JavaScript.");
}
console.log("Browser JavaScript and source map checks passed.");
