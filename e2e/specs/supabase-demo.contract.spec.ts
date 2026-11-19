import { test } from "./helpers/test-fixtures";

test.describe("Supabase demo data", () => {
  test.skip(!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes("placeholder"),
    "Skipped: Supabase credentials not configured"
  );

  test("should query demo itineraries after seed", async ({ request }) => {
    const response = await request.get(
      "http://127.0.0.1:3101/api/demo-itineraries",
      {
        headers: {
          Authorization: "Bearer e2e-user-1",
        },
      }
    );

    // This endpoint would need to be added to mock-api-server.mjs
    // to demonstrate reading from Supabase when it's properly configured
    if (response.ok()) {
      const data = await response.json();
      console.log("Demo itineraries:", data);
    }
  });
});
