import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";
import https from "node:https";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
if (!["up", "url", "rebuild"].includes(action)) {
  console.error("Usage: node scripts/demo-tunnel.mjs up|url|rebuild");
  process.exit(1);
}
if (!existsSync(path.join(root, ".env"))) {
  console.error("Missing .env. Copy .env.example and set a JWT_SECRET before starting the demo.");
  process.exit(1);
}

const compose = [
  "compose", "--env-file", ".env",
  "-f", "deploy/docker/docker-compose.stack.yml",
  "-f", "deploy/docker/docker-compose.dev.yml",
  "--profile", "demo",
];

function docker(args, inherit = false) {
  const result = spawnSync("docker", [...compose, ...args], {
    cwd: root,
    // The public demo must call the API through the web origin, never localhost on a visitor's device.
    env: { ...process.env, NEXT_PUBLIC_API_URL: "" },
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `docker compose ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function currentUrl() {
  const logs = docker(["logs", "--no-color", "demo-tunnel"]);
  return logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)?.at(-1);
}

async function healthy(url) {
  if (!url) return false;
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000) });
    return response.ok && databasesHealthy(await response.json());
  } catch {
    // macOS may cache NXDOMAIN briefly after Cloudflare has published a new hostname.
    try {
      const hostname = new URL(url).hostname;
      const resolver = new Resolver();
      resolver.setServers(["1.1.1.1", "8.8.8.8"]);
      const [address] = await resolver.resolve4(hostname);
      if (!address) return false;
      return await new Promise((resolve) => {
        const request = https.get(`${url}/health`, {
          lookup: (_hostname, _options, callback) => callback(null, address, 4),
          timeout: 8_000,
        }, (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => { body += chunk; });
          response.on("end", () => {
            try {
              resolve(response.statusCode === 200 && databasesHealthy(JSON.parse(body)));
            } catch {
              resolve(false);
            }
          });
          response.on("error", () => resolve(false));
        });
        request.on("timeout", () => request.destroy());
        request.on("error", () => resolve(false));
      });
    } catch {
      return false;
    }
  }
}

function databasesHealthy(status) {
  return status?.services?.postgres === "ok" && status?.services?.mongo === "ok";
}

try {
  if (action === "rebuild") {
    docker(["up", "-d", "--build"], true);
  } else {
    docker(["up", "-d"], true);
  }

  let url = currentUrl();
  if (!(await healthy(url))) {
    console.log("Creating a fresh Cloudflare Quick Tunnel...");
    docker(["up", "-d", "--no-deps", "--force-recreate", "demo-tunnel"], true);
    url = undefined;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    url = currentUrl();
    if (await healthy(url)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (!(await healthy(url))) {
    throw new Error("The tunnel did not become healthy. Inspect: docker compose --env-file .env -f deploy/docker/docker-compose.stack.yml -f deploy/docker/docker-compose.dev.yml --profile demo logs demo-tunnel");
  }

  console.log(`\nDemo URL: ${url}/signup`);
  console.log("Local URL: http://localhost:3000/signup");
  console.log("Quick Tunnel URLs are temporary. Run `pnpm demo:url` to check or replace an expired link.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
