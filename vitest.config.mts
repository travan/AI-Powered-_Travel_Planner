import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
      "next/link": path.resolve(
        __dirname,
        "apps/web/node_modules/next/link.js",
      ),
      "@travel/api-client": path.resolve(
        __dirname,
        "packages/api-client/src/index.ts",
      ),
      "@travel/design-tokens": path.resolve(
        __dirname,
        "packages/design-tokens/src/index.ts",
      ),
      "next/navigation": path.resolve(
        __dirname,
        "apps/web/node_modules/next/navigation.js",
      ),
      "@travel/hooks": path.resolve(__dirname, "packages/hooks/src/index.ts"),
      "@travel/types": path.resolve(__dirname, "packages/types/src/index.ts"),
      "@supabase/supabase-js": path.resolve(
        __dirname,
        "apps/mobile/node_modules/@supabase/supabase-js",
      ),
      "expo-linking": path.resolve(
        __dirname,
        "apps/mobile/node_modules/expo-linking",
      ),
      "react-native": path.resolve(
        __dirname,
        "apps/mobile/node_modules/react-native/index.js",
      ),
      "expo-secure-store": path.resolve(
        __dirname,
        "apps/mobile/node_modules/expo-secure-store",
      ),
      "expo-web-browser": path.resolve(
        __dirname,
        "apps/mobile/node_modules/expo-web-browser",
      ),
      axios: path.resolve(__dirname, "packages/scrapers/node_modules/axios"),
      react: path.resolve(__dirname, "apps/web/node_modules/react"),
      "react-dom": path.resolve(__dirname, "apps/web/node_modules/react-dom"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    setupFiles: ["tests/unit/setup-env.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "playwright-report/**",
      "test-results/**",
      "e2e/**",
      "tests/unit/apps/api/**",
      "**/*.d.ts",
      "**/*.config.*",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "packages/ai/src/**/*.ts",
        "packages/scrapers/src/**/*.ts",
        "packages/hooks/src/**/*.ts",
        "packages/ui/src/**/*.{ts,tsx}",
        "apps/web/lib/**/*.ts",
        "apps/web/hooks/**/*.ts",
        "apps/mobile/lib/**/*.ts",
      ],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/.next/**",
        "**/.expo/**",
        "playwright-report/**",
        "test-results/**",
        "e2e/**",
        "tests/unit/**",
        "packages/types/**",
        "packages/config/**",
        "packages/ai/src/providers/**",
        "packages/ai/src/prompts/**",
        "packages/ai/src/provider.ts",
        "packages/scrapers/src/{astro,booking,social,tickets,transport}.ts",
        "apps/mobile/lib/supabase.ts",
        "apps/web/lib/supabase/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/*.test.*",
        "**/*.spec.*",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
