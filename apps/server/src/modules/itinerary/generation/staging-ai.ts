import type { WorkersAI } from "../../../cloudflare/request-context.js";

/** Synthetic infrastructure fixture. Never installed on the production Worker. */
export const stagingAi: WorkersAI = {
  async run(_model, payload) {
    if (
      process.env.PLANNING_STAGING !== "true" ||
      process.env.AI_PROVIDER !== "mock"
    )
      throw new Error("Synthetic AI requires isolated mock staging");
    const messages = payload.messages as { content: string }[];
    const context = JSON.parse(messages.at(-1)!.content.split("\n").at(-1)!);
    // City resolution is exercised separately with the real resolver. Seed staging cities.
    if (context.destinations.some((d: { city?: string }) => !d.city))
      throw new Error(
        "Seed verified staging cities before infrastructure tests",
      );
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    return {
      response: {
        cities: [],
        items: context.missing.map(
          (n: { key: string; kind: string; fixed_name?: string }) => ({
            key: n.key,
            name: n.fixed_name ?? `Synthetic staging ${n.key}`,
            duration_minutes: 120,
            amount:
              n.kind === "stay" ? 300000 : n.kind === "leg" ? 500000 : 10000,
          }),
        ),
      },
    };
  },
};
