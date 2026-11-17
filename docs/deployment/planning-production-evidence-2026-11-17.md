# Production generation evidence — 2026-11-17

## Release status

**Not released to general V2 traffic.** Production serves commit `49f8fea308ef4ca16e735d494a28fb6f2f55e3bd` with `PLANNING_V2_PERCENT=0`, Queue producer/consumer, DLQ, recovery cron, and concurrency one. Only the dedicated CI account can override the pipeline. No personal account was granted access. The latest positive-cost schema candidate is not deployed: its isolated real-model gate returned `AI_RESULT_UNKNOWN`.

GitHub Actions did not start jobs for the final revisions. The annotation states that recent account payments failed or the spending limit needs increasing. Local checks were used for the bounded 0% candidate deployment; this is not a successful GitHub CI run. The PR remains unmerged. No staging was created.

## Actual production results

| Case / pipeline | Job | Result | AI calls | Input / output tokens |
| --- | --- | --- | --- | --- |
| Exact MY → SG, 20m VND / V2, initial round | `8b9c8069-61a3-40c0-842b-553ad8e1d921` | Explicit mandatory travel/stay budget rejection, 63.2s; **no itinerary** | 1 | 2,061 / 1,644 |
| MY → SG, 200m VND / V2, initial round | `da8650e8-f43a-4956-82b1-ce9c99f9ebce` | Failed city lookup, 178.7s, three processing attempts | 1 | 2,061 / 1,639 |
| Da Nang, 3 days, 30m VND / V2 | `e346fcb6-3779-4d1f-9846-c598ef12e15a` | Complete, 34.4s; plan validation passed | 1 | 1,133 / 599 |
| Exact MY → SG / V1, accepted before runner stopped | `9fc5c0e0-edc0-405e-8397-335fbd86ef5b` | `AI_OUTLINE_INVALID`; reconciled through polling without resubmission | 2 | 6,475 total tokens |
| Exact MY → SG / V2, fresh round after resolver fixes | `66506b38-de48-4d70-b40e-c411e26f1e3f` | `AI_RESPONSE_INVALID`, 68.8s: model supplied zero for all three unconfirmed international fares | 1 | 2,081 / 1,627 |

The first comparison stopped after the V2 infrastructure failure. One V1 job was already accepted and its terminal evidence was recovered. The second comparison stopped after its first invalid V2 response. Neither is a passing six-case comparison; neither supports a population completion rate or a V1/V2 quality claim.

The failed wide-budget V2 job was subsequently resumed using its saved response after the resolver fixes. It completed all ten days at 22,693,000 VND and passed the production plan validator. **Additional AI calls: zero.** This diagnostic resume does not replace the originally failed comparison or certify a fresh canary.

## Confirmed fixes

- Named country/city context, provider factory, safe job metadata and quota diagnostics are implemented. Provider remains Cloudflare; no automatic provider fallback was used.
- Real model output exposed a scheduler failure for a six-hour return departing at the default 19:00. Provisional travel now fits the final day; meal/evening reservations are retained, and confirmed departures are never moved to force a fit.
- [Cloudflare Workers does not support `redirect: "error"`](https://developers.cloudflare.com/workers/runtime-apis/request/). Resolver, weather and currency fetches use `manual` and reject redirect responses instead of following them.
- Nominatim represents Kuala Lumpur as an administrative state. City-only searches now fall back to validated Photon city results when primary or cached results contain no eligible city. Administrative regions/countries are not relabeled as cities. Real production lookup and the saved-response resume verified this fix.
- The binding verifier accepts Cloudflare's actual consumer `script` field and validates producer, consumer, DLQ and concurrency.
- Canary reports save the accepted job ID immediately and stop on a failed V2 gate before submitting further cases.

The new candidate constrains unconfirmed mandatory costs to positive values and tells the model to return realistic estimates even when over budget. Zero-fare output is still rejected, not converted into a budget rejection or repaired with invented prices. Its real-model test dispatched once, returned an unknown outcome with unavailable token usage, and was not repeated or deployed.

## Technical checks and limits

655 unit tests passed. All workspace type checks, the unified production build and Worker bundle were checked locally; subsequent server changes passed server type checks and Worker builds. The 100-job mock pipeline completed with 100 calls and no duplicate itineraries. These are technical checks, not production generation certification.

Cloudflare has real inference evidence. Claude, OpenAI and Gemini have adapter contract tests but **no live credential verification**. BYOK and token purchases remain deferred. Quota UI changes are in the PR; the production web release is still pending merge.

Local evidence is under `test-results/production-generation/` (ignored): `compare-abd7a6e-failed.json`, `compare-49f8fea-failed.json`, `reconciled-v1-original.json`, `resume-wide-49f8fea.json`, and `final-health.json`. The synthetic test account credentials are excluded. Candidate model reports are under `test-results/generation-v2-live/`.

## Remaining release gate

Restore an executable CI runner/billing state, establish a successful real-model gate for the latest candidate without replaying its unknown dispatch ticket, then run one bounded fresh comparison. Both V2 controls must complete, and the original payload must complete or produce a concrete constraint rejection. Preserve failures. Only then promote to 100%, verify the ordinary API without an override, and retain the 0% compensation path if verification fails. Health alone cannot satisfy this gate.
