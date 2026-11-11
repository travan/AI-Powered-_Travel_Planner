const checks = [
  {
    name: "Google OAuth metadata",
    url: "https://www.googleapis.com/oauth2/v3/certs",
    valid: (body) => Array.isArray(body.keys) && body.keys.length > 0,
  },
  {
    name: "Exchange rates",
    url: "https://open.er-api.com/v6/latest/USD",
    valid: (body) => body.result === "success" && body.rates?.USD === 1,
  },
];

const placesKey = process.env.SANDBOX_GOOGLE_PLACES_KEY;
if (placesKey)
  checks.push({
    name: "Google Places",
    url: "https://places.googleapis.com/v1/places:searchText",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({ textQuery: "Tokyo National Museum", pageSize: 1 }),
    },
    valid: (body) => Array.isArray(body.places) && body.places.length > 0,
  });
else console.log("Google Places: mock-only");

const account = process.env.SANDBOX_CLOUDFLARE_ACCOUNT;
const token = process.env.SANDBOX_CLOUDFLARE_AI_TOKEN;
if (token && /^[0-9a-f]{32}$/.test(account ?? ""))
  checks.push({
    name: "Workers AI",
    url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "Reply with OK.", max_tokens: 8 }),
    },
    valid: (body) =>
      body.success === true && typeof body.result?.response === "string",
  });
else console.log("Workers AI: mock-only");

for (const name of ["Geocoding", "Weather", "SMTP", "Alternate AI providers"])
  console.log(`${name}: mock-only`);
for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      ...check.init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !check.valid(await response.json())) throw new Error();
    console.log(`${check.name}: passed`);
  } catch {
    console.error(`${check.name}: failed`);
    process.exitCode = 1;
  }
}
