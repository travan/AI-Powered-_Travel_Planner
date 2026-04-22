import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'apps/web/node_modules/react'),
      'react-dom': path.resolve(__dirname, 'apps/web/node_modules/react-dom'),
    },
  },
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
        'apps/web/lib/**/*.ts',
        'apps/web/hooks/**/*.ts',
        'apps/mobile/lib/**/*.ts',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/.next/**',
        '**/.expo/**',
        'playwright-report/**',
        'test-results/**',
        'e2e/**',
        'packages/types/**',
        'packages/config/**',
        'packages/ai/src/providers/**',
        'packages/ai/src/prompts/**',
        'packages/ai/src/provider.ts',
        'packages/scrapers/src/{astro,booking,social,tickets,transport}.ts',
        'apps/mobile/lib/supabase.ts',
        'apps/web/lib/supabase/**',
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