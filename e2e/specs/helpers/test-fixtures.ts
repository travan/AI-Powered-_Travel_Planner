import { test as base } from "@playwright/test";
export { expect } from "@playwright/test";
export type { Page, Locator, BrowserContext } from "@playwright/test";

// Browser contracts exercise local application/API behavior. Remote decorative
// photos and fonts must not hold page load open or make these tests depend on a CDN.
export const test = base.extend<{ localAssets: void }>({
  localAssets: [
    async ({ context }, use) => {
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const external =
          ["http:", "https:"].includes(url.protocol) &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (
          external &&
          ["image", "font", "stylesheet"].includes(request.resourceType())
        ) {
          if (request.resourceType() === "image")
            await route.fulfill({
              contentType: "image/png",
              body: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
                "base64",
              ),
            });
          else
            await route.fulfill({
              status: 200,
              contentType:
                request.resourceType() === "stylesheet"
                  ? "text/css"
                  : "font/woff2",
              body: "",
            });
        } else await route.continue();
      });
      await use();
    },
    { auto: true },
  ],
});
