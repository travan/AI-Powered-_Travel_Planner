import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect } from "../specs/helpers/test-fixtures";
const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);
const replays = JSON.parse(
  readFileSync("test-results/production-validation/replays.json", "utf8"),
);
const api = "http://127.0.0.1:8787";

test("production runtime uses the real local database, queue and strict authentication", async ({
  request,
}) => {
  const health = await request.get(`${api}/health`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    services: { postgres: "ok", documents: "postgres" },
    planning_pipeline: {
      canary_enabled: true,
      v2_percent: 100,
      ai_concurrency: 1,
      queue_bound: true,
      provider: "cloudflare",
      staging: false,
    },
  });
  expect(
    (
      await request.get(`${api}/api/auth/me`, {
        headers: { authorization: "Bearer mock-access-admin" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get(`${api}/api/planning/config`)).ok()).toBe(true);
});

for (const scenario of replays) {
  test(`${scenario.name}: queued replay persists a plan and displays warnings in the production web build`, async ({
    request,
    page,
  }, testInfo) => {
    const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
    await db.connect();
    const email = `production-local-${randomUUID()}@test.invalid`;
    const password = "Local-test-password-93!";
    let userId: string | undefined;
    try {
      const registered = await request.post(`${api}/api/auth/register`, {
        data: { email, password, full_name: "Local validation" },
      });
      expect(registered.status()).toBe(201);
      const auth = await registered.json();
      userId = auth.user.id;
      const token = auth.session.access_token;
      const { input, snapshot } = scenario;
      const generation = randomUUID();
      const job = randomUUID();
      const hash = `local-replay-${generation}`;
      await db.query("begin");
      await db.query(
        "insert into planning_generations(id,user_id,request_hash,checkpoint) values($1,$2,$3,$4)",
        [generation, userId, hash, snapshot],
      );
      await db.query(
        "insert into planning_generation_ai(generation_id,state,response,completed_at) values($1,'received',$2,now())",
        [generation, { response: scenario.response }],
      );
      await db.query(
        "insert into itinerary_jobs(id,user_id,kind,payload,pipeline_version,generation_id,request_hash,deadline_at) values($1,$2,'generate',$3,2,$4,$5,now()+interval '10 minutes')",
        [job, userId, { dto: input }, generation, hash],
      );
      await db.query("commit");
      // Exercise the production cron -> durable dispatch -> Queue consumer path.
      expect(
        (await request.get(`${api}/__scheduled?cron=*+*+*+*+*`)).ok(),
      ).toBe(true);
      let completed: any;
      await expect
        .poll(
          async () => {
            completed = (
              await db.query(
                "select status,itinerary_id,error_code from itinerary_jobs where id=$1",
                [job],
              )
            ).rows[0];
            return completed.status;
          },
          { timeout: 60000, intervals: [250, 500, 1000] },
        )
        .toBe("complete");
      const saved = (
        await db.query("select result from itineraries where id=$1", [
          completed.itinerary_id,
        ])
      ).rows[0].result;
      expect(saved.days).toHaveLength(10);
      if (scenario.incomplete) {
        expect(saved.transport_summary.at(-1).price.amount).toBeNull();
        expect(saved.budget_breakdown.complete).toBe(false);
      }
      expect(saved.issues).toContainEqual(
        expect.objectContaining({
          code: scenario.warning,
          severity: "warning",
        }),
      );
      expect(
        saved.issues.every((issue: any) => issue.severity === "warning"),
      ).toBe(true);
      const authorized = await request.get(
        `${api}/api/itinerary/${completed.itinerary_id}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(authorized.ok()).toBe(true);
      expect(
        (
          await request.get(`${api}/api/itinerary/${completed.itinerary_id}`)
        ).status(),
      ).toBe(404); // Private itinerary existence is hidden from anonymous callers.
      const storedAI = (
        await db.query(
          "select state,response from planning_generation_ai where generation_id=$1",
          [generation],
        )
      ).rows[0];
      expect(storedAI).toEqual({
        state: "received",
        response: { response: scenario.response },
      });

      await page.goto("/login");
      await page.getByTestId("web-auth-email").fill(email);
      await page.getByTestId("web-auth-password").fill(password);
      await page.getByTestId("web-auth-submit-login").click();
      await expect(page).toHaveURL(/\/plan$/);
      await page.goto(`/itinerary/${completed.itinerary_id}`);
      await expect(
        page.getByRole("heading", { name: "Check before booking" }),
      ).toBeVisible();
      await expect(
        page
          .getByText(
            /repeated sightseeing stop|Some places and prices are unverified AI suggestions/,
          )
          .first(),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("production-plan-with-warnings.png"),
        fullPage: true,
      });
      // Redelivery/recovery must not create another itinerary from the saved response.
      await request.get(`${api}/__scheduled?cron=*+*+*+*+*`);
      expect(
        (
          await db.query(
            "select count(*)::int as count from itineraries where user_id=$1",
            [userId],
          )
        ).rows[0].count,
      ).toBe(1);
      await testInfo.attach("result", {
        body: JSON.stringify(
          {
            scenario: scenario.name,
            days: saved.days.length,
            warnings: saved.issues.map((issue: any) => issue.code),
            additionalAIRequests: 0,
            runtime: "workerd",
            database: "local-postgres",
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await db.query("rollback");
      if (userId) {
        await db.query("delete from itinerary_jobs where user_id=$1", [userId]);
        await db.query("delete from planning_generations where user_id=$1", [
          userId,
        ]);
        await db.query("delete from itineraries where user_id=$1", [userId]);
        await db.query("delete from users where id=$1", [userId]);
      }
      await db.end();
    }
  });
}
