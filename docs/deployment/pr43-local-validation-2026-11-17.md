# PR #43 — local pipeline validation, 2026-11-17

The technical commands underlying the PR workflows passed locally with **Node 22.22.0 / pnpm 10.15.0**. This is not a green GitHub Actions run or a completed production release gate.

Application source tested: `58bb109587a98e6460f84130559f2c7f4f1c2268`. Deployment helper source: `28f7ef579f4d5d39486e3c2b846d6698adcbe388`. The latter changes CLI authentication, its tests and the runbook; application code, packages, E2E fixtures, workflows and dependency manifests are unchanged between those revisions. Builds and deployment-helper checks were repeated after the helper change. Host checks ran on macOS; the Docker build and runtime ran Linux/Node 22.

| Pipeline step | Local result |
| --- | --- |
| Frozen dependency install | Passed |
| Lint and six workspace type-check tasks | Passed |
| Unit/coverage suite | **662 passed**; both existing development/test environment variants checked |
| Security unit tests and provider fixture contracts | Passed |
| Pinned, redacted tracked-content gitleaks scan | Passed, including final helper revision |
| Dependency advisory delta policy | Passed; dependency manifests unchanged; **77 inherited high/critical advisories remain** |
| Local/cloud schema parity and migration replay | Passed against disposable databases |
| Browser/runtime database role boundaries | Passed |
| V2 admission, checkpoint/resume and single-dispatch checks | Passed |
| V2 mock pipeline | **100/100** ten-day jobs, exactly 100 mock calls, zero duplicate itineraries |
| Unified production server/web build | Passed |
| Browser assets: server-secret sentinel and public source maps | Passed |
| API and real-browser security integration | **21 passed**, none skipped |
| Desktop / responsive / mobile-web E2E | **48 / 8 / 14 passed**, 70 total, no retries needed |
| Unified artifact archive | Passed; rebuilt production output after dev-server E2E |
| Docker image build and Linux runtime health with isolated PostgreSQL | Passed |
| PM2/systemd shell syntax and Compose profile configuration | Passed; no deployment performed |
| Production Worker bundle dry-run | Passed |
| Production producer/consumer/DLQ verification via local Wrangler OAuth | Passed; no explicit API-token environment variable and no model request |

Shared checks duplicated across `ci-cd.yml`, `pipeline-unified-deploy.yml`, `security.yml`, `playwright-e2e.yml` and the technical part of `staging-deploy.yml` were executed once where identical. The Unified `NODE_ENV=test` coverage variant was also run. There was no staging deployment: the project uses production canary testing by the user's decision. Actual PM2/systemd/self-hosted deployments and the optional provider-sandbox workflow were not triggered. GitHub checkout/cache/upload/environment handling cannot be certified by local command execution.

## Findings and limits

- The initial local harness incorrectly passed `NODE_ENV=development` to `next build`, producing a prerender error. Correcting the harness to production, as in the workflow, made the build pass. No application workaround was added. The initial and corrected logs are retained separately.
- The current coverage configuration exits successfully with aggregate **47.08% statements/lines, 56.09% functions and 81.55% branches**. This report does **not** claim 80% overall coverage. The existing coverage configuration was not weakened or changed in this PR.
- Passing the dependency-delta policy does not mean dependencies are free of advisories. The 77 inherited high/critical findings remain outside this change's dependency scope.
- No new real-model request was made during this local validation. The latest production generation round is still blocked by Cloudflare daily quota; see [production evidence](planning-production-evidence-2026-11-17.md). Local mocks and Docker health do not replace the six-case production comparison.

## Cloudflare deployment after merge

Automatic deployment will not start while GitHub-hosted Actions is blocked by account billing. **Worker upload through local Wrangler remains available.** The Queue provisioning and verification commands now reuse an existing `wrangler login` session when `CLOUDFLARE_API_TOKEN` is absent. Token output is captured internally and is not printed or saved to reports. This path was verified against the existing production Queue, consumer and DLQ.

The [post-merge local deployment runbook](planning-production-canary.md#deploying-a-merged-commit-while-github-actions-is-blocked) specifies checking out the merged commit, applying the same technical/candidate gates, preparing CI-only V2 at 0%, migration validation, Worker upload and commit/binding checks. This does not bypass the production generation gate: quota exhaustion still blocks promotion to 100%. It does not alter GitHub's failed check statuses, billing settings, workflow history or account permissions.

No merge or new production deploy was performed as part of this local-check request. Production continues serving the already tested canary revision `ed17d41b157d59757f6e5563d0d0260acfb4f26c` at 0% general V2 admission.

Raw logs, per-check results, browser evidence and the production artifact archive are under ignored `test-results/pr43-local/`; the consolidated record is `summary.json`. No credentials are included in the tracked report.
