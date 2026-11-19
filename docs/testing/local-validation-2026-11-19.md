# Local validation — 2026-11-19

Candidate code: `fd09a16`; E2E navigation fix: `4eef5b1` on `codex/gemini-quota-fallback`.

All checks use local fixtures or mocked providers. PostgreSQL 16 was started in a dedicated temporary Docker container with isolated test databases and a non-superuser application role. No production database or live model was used.

| Check | Result |
| --- | --- |
| Full Vitest suite with coverage | 89 files, 717 tests passed |
| Dedicated security unit suite | 10 files, 98 tests passed |
| Workspace type-check | 6 tasks passed |
| Workspace lint | 2 tasks passed |
| Unified server/web production build | Passed |
| Browser bundle secret sentinel and source maps | Passed |
| Schema, migration checksum and catalog parity | Passed |
| Local/cloud database role boundaries | Passed |
| Generation admission, single dispatch, durability and permit checks | Passed |
| Catalog-first pipeline | 100/100 ten-day plans complete; no duplicate itineraries; complete catalog required no AI calls |
| API/security E2E with production web and PostgreSQL | 21 passed |
| Web desktop and responsive E2E | 54 passed on full run; 2 initial navigation timeouts corrected and both passed on targeted rerun |
| Mobile-web E2E | 14 passed |
| Local-auth web and Expo Web E2E | 5 passed |
| Pinned CI Gitleaks image, committed source snapshot | No leaks found |
| Production dependency advisory gate | Passed; no new high/critical entries; 77 inherited entries remain |

The two web auth-error tests timed out in `page.goto` waiting for the page `load` event before their assertions ran. They now wait for `domcontentloaded`, then use the original form and error assertions. This avoids depending on decorative third-party images/fonts; no application auth behavior was changed.

Dependency manifests and the lockfile are unchanged relative to `main`. The existing advisory gate reports the inherited dependency findings separately; passing this gate is not a claim that all dependencies are free of known vulnerabilities.

GitHub Actions was unable to start jobs. Its annotation states: “The job was not started because recent account payments have failed or your spending limit needs to be increased.” Local validation reproduces the available CI/security checks. No branch protections or required checks were changed. Live-provider sandbox smoke and production deployment are outside this local run.

Reproduce with the repository commands `pnpm test:coverage`, `pnpm test:security`, `pnpm type-check`, `pnpm lint`, `pnpm build:unified`, the generation V2/parity/role scripts, `pnpm test:e2e:server` with `DOCUMENT_STORE=postgres` and `E2E_SECURITY_WEB=true`, `pnpm test:e2e:web`, `pnpm test:e2e:mobile`, and `pnpm test:e2e:auth:local`. Database scripts require dedicated localhost test URLs as documented in their guards.
