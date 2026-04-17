import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.{ts,tsx}',
      'packages/**/*.spec.{ts,tsx}',
      'apps/**/*.test.{ts,tsx}',
      'apps/**/*.spec.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'playwright-report/**',
      'test-results/**',
      'e2e/**',
      '**/*.d.ts',
      '**/*.config.*',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: [
        'packages/ai/src/**/*.ts',
        'packages/scrapers/src/**/*.ts',
        'packages/hooks/src/**/*.ts',
        'packages/ui/src/**/*.{ts,tsx}',
        'apps/api/src/**/*.ts',
        'apps/web/**/*.{ts,tsx}',
        'apps/mobile/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.next/**',
        '.expo/**',
        'playwright-report/**',
        'test-results/**',
        'e2e/**',
        'packages/types/**',
        'packages/config/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});