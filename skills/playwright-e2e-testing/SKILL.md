# Playwright E2E Testing Skill

## Overview
This skill provides comprehensive guidance for implementing and managing end-to-end (e2e) tests using Playwright in the AI-Powered Travel Planner project. It covers test setup, writing tests, running tests, debugging, and best practices for reliable e2e testing across web, mobile, and API components.

## Key Capabilities
- **Test Setup and Configuration**: Configure Playwright for multi-platform testing (web, mobile web, API contracts)
- **Test Writing**: Create robust e2e tests for user journeys, API interactions, and cross-platform compatibility
- **Test Execution**: Run tests locally, in CI/CD, and with different browsers/devices
- **Debugging and Maintenance**: Troubleshoot failing tests, handle flaky tests, and maintain test suites
- **Best Practices**: Implement reliable selectors, handle async operations, and ensure test isolation

## When to Use This Skill
Use this skill when:
- Writing new e2e tests for user flows (login, trip planning, itinerary management)
- Debugging failing Playwright tests
- Setting up test environments for different platforms
- Optimizing test performance and reliability
- Migrating or refactoring existing test suites
- Implementing visual regression testing
- Testing API contracts and integrations

## Prerequisites
- Node.js and pnpm installed
- Playwright installed (`pnpm add -D @playwright/test`)
- Project dependencies installed (`pnpm install`)
- Basic understanding of JavaScript/TypeScript and web technologies

## Configuration

### Playwright Config (playwright.config.ts)
The project uses a centralized Playwright configuration:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { devices['iPhone 12'] },
    },
  ],
});
```

### Environment Setup
- **Local Development**: Use `pnpm run dev` to start the web app on port 3000
- **API**: Ensure the API server is running on the configured port
- **Database**: Supabase setup verified (see SUPABASE_SETUP_GUIDE.md)
- **Mobile Testing**: Use Playwright's mobile emulation or connect to real devices

## Test Structure

### Directory Organization
```
e2e/
├── specs/                    # Test specifications
│   ├── web.contract.spec.ts      # Web app contract tests
│   ├── mobile-web.contract.spec.ts # Mobile web tests
│   ├── supabase-demo.contract.spec.ts # Supabase integration tests
│   └── helpers/               # Test helper functions
├── fixtures/                 # Test data and mocks
│   ├── cities.mjs
│   ├── itineraries.mjs
│   └── mock-api-server.mjs
├── support/                  # Shared test utilities
└── global-setup.ts           # Global test setup
```

### Test File Naming Convention
- `*.contract.spec.ts`: Tests that verify contracts between components
- `*.spec.ts`: Standard e2e tests
- Use descriptive names: `user-login-flow.spec.ts`, `trip-planning.spec.ts`

## Writing Tests

### Basic Test Structure
```typescript
import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test('should allow user to login with valid credentials', async ({ page }) => {
    // Arrange
    await page.goto('/auth/login');
    
    // Act
    await page.fill('[data-testid="email-input"]', 'user@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Assert
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
  });
});
```

### Page Object Model
Use page objects for reusable components:

```typescript
// e2e/support/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/auth/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-button"]');
  }

  async expectToBeLoggedIn() {
    await expect(this.page).toHaveURL('/dashboard');
  }
}
```

### API Testing
Test API endpoints directly:

```typescript
test('should create new itinerary via API', async ({ request }) => {
  const response = await request.post('/api/itineraries', {
    data: {
      destination: 'Tokyo',
      duration: 7,
      budget: 2000
    }
  });
  
  expect(response.ok()).toBeTruthy();
  const itinerary = await response.json();
  expect(itinerary.id).toBeDefined();
});
```

### Mobile Testing
Use mobile-specific configurations:

```typescript
test.describe('Mobile Trip Planning', () => {
  test.use({ ...devices['iPhone 12'] });
  
  test('should display mobile-optimized trip planner', async ({ page }) => {
    await page.goto('/plan');
    
    // Check mobile layout
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.desktop-nav')).toBeHidden();
  });
});
```

## Running Tests

### Local Execution
```bash
# Run all tests
pnpm playwright test

# Run specific test file
pnpm playwright test specs/web.contract.spec.ts

# Run tests in specific browser
pnpm playwright test --project=chromium

# Run tests with UI mode
pnpm playwright test --ui

# Run tests in debug mode
pnpm playwright test --debug
```

### CI/CD Execution
```bash
# Headless mode for CI
pnpm playwright test --headed=false

# Generate and serve report
pnpm playwright show-report
```

### Parallel Execution
Tests run in parallel by default. Configure workers in playwright.config.ts:
- Local: `workers: undefined` (auto-detect)
- CI: `workers: 1` (sequential for stability)

## Debugging Techniques

### Traces and Screenshots
```typescript
test('debug failing login', async ({ page }) => {
  await page.goto('/auth/login');
  
  // Take screenshot on failure
  await page.screenshot({ path: 'login-failure.png' });
  
  // Enable tracing
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  
  // ... test steps ...
  
  await page.context().tracing.stop({ path: 'trace.zip' });
});
```

### Interactive Debugging
```bash
# Run in debug mode
pnpm playwright test --debug

# Use Playwright Inspector
pnpm playwright test --headed --timeout=0
```

### Common Issues
- **Flaky Tests**: Use `test.retry()` or `test.slow()` for unstable tests
- **Timeouts**: Increase timeout for slow operations: `test.setTimeout(60000)`
- **Selectors**: Prefer data-testid attributes over CSS selectors
- **Async Operations**: Use `await page.waitForLoadState('networkidle')` for dynamic content

## Best Practices

### Test Reliability
1. **Use Stable Selectors**: Prefer `[data-testid="element"]` over `.class` or `#id`
2. **Wait for Elements**: Use `await expect(locator).toBeVisible()` instead of `page.waitForSelector()`
3. **Handle Async Operations**: Wait for network requests to complete
4. **Isolate Tests**: Each test should be independent; use `test.beforeEach()` for setup
5. **Mock External Dependencies**: Use fixtures for API responses and external services

### Performance Optimization
1. **Parallel Execution**: Run tests in parallel to reduce execution time
2. **Selective Testing**: Use `--grep` to run specific test patterns
3. **Shared Browser Context**: Reuse browser contexts when possible
4. **Minimal Assertions**: Only assert what's necessary for the test case

### Maintenance
1. **Regular Updates**: Keep Playwright and browsers updated
2. **Code Reviews**: Review test code changes like production code
3. **Documentation**: Document complex test scenarios and custom utilities
4. **Monitoring**: Track test flakiness and failure rates

## Integration with Project Workflow

### Development Workflow
1. Write tests alongside feature development (TDD approach)
2. Run tests locally before committing
3. Use pre-commit hooks to run critical tests
4. Integrate with CI/CD for automated testing

### Cross-Platform Testing
- **Web**: Test on multiple browsers (Chrome, Firefox, Safari)
- **Mobile Web**: Test on mobile emulations and real devices
- **API**: Test contracts between frontend and backend
- **Integration**: Test full user journeys across platforms

### Monitoring and Reporting
- Use Playwright's HTML reporter for detailed test results
- Integrate with CI tools (GitHub Actions, etc.) for automated reporting
- Track test metrics: pass/fail rates, execution time, flakiness

## Troubleshooting

### Common Errors
- **Element not found**: Check selector stability and wait strategies
- **Timeout errors**: Increase timeouts or optimize page load times
- **Browser crashes**: Update Playwright and browser versions
- **CI failures**: Ensure proper environment setup and dependencies

### Resources
- [Playwright Documentation](https://playwright.dev/)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
- [Playwright Test Runner](https://playwright.dev/docs/test-runner)
- [Best Practices Guide](https://playwright.dev/docs/best-practices)

This skill ensures comprehensive, reliable e2e testing for the AI-Powered Travel Planner project using Playwright.