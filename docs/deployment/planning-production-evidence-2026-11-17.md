# Production generation evidence — 2026-11-17

## Release status

**V2 is deployed on Cloudflare for production canary testing.** The current Worker serves commit `ed17d41b157d59757f6e5563d0d0260acfb4f26c`, with Queue producer/consumer, DLQ, recovery cron and concurrency one. Only the dedicated CI account has pipeline override access. General rollout remains 0% because the provider exhausted its daily allocation during the production control cases; this is not a passing release gate.

The complete-item `anyOf` branches now declare name, amount and duration. The prior partial branches had caused the model to omit names/durations. Before deployment, real-model candidate checks passed: the exact 20m payload returned an explicit budget rejection; the wide route completed ten days at 43,967,000 VND; Da Nang completed three days at 17,798,000 VND. Each dispatched once. 657 unit tests, all six workspace type-check tasks and the Worker bundle passed. GitHub Actions remains blocked by account billing/spending limits; these are local technical checks, not green remote CI.

## Latest production comparison — `manual-ed17d41-20261117`

| Case / V2 | Job | Result | Calls | Input / output tokens |
| --- | --- | --- | --- | --- |
| Exact MY → SG, 20m VND | `9eba2bd6-611e-4ccc-8927-8cfbde782bfd` | Concrete mandatory travel/stay budget rejection, 101.3s; **no itinerary** | 1 | 2,126 / 2,015 |
| MY → SG, 200m VND | `201b428f-662a-4d6d-9f83-dc0a45b024e2` | **Complete**, ten days, Kuala Lumpur → Singapore with origin/return legs, 51,293,000 VND, 85.8s; plan validation passed | 1 | 2,126 / 2,007 |
| Da Nang, 3 days, 30m VND | `f4daf129-d338-4f0e-8165-72dd993900c4` | `AI_QUOTA_EXHAUSTED`, 7.3s; not successful generation | 1 rejected request | unavailable |

The runner stopped on quota exhaustion before sending V1 baselines. The new round therefore does not provide a complete V1/V2 comparison or certify a population completion rate. No fallback provider was selected and no generation was automatically retried.

The backend returned estimated recovery at `2026-11-18T00:00:00.000Z` (**07:00 on 18 November in Vietnam**). Recovery is not guaranteed. A production retry-guard check on the exhausted V2 job returned HTTP 409 / `AI_QUOTA_EXHAUSTED`; its recorded call count stayed one. A consumed quota ticket cannot resume as a fresh inference.

Raw synthetic test evidence is in `test-results/v2-production-test-20261117-0342/`: `release-status.json`, `production-compare.json`, `quota-guard.json` and the three candidate reports. It contains no session credentials.

## Earlier production results

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

The earlier positive-cost candidate returned an unknown outcome, then a later real response exposed missing names/durations from partial schema branches. Complete item schemas in each branch fixed that issue. Zero-fare output is still rejected, not converted into a budget rejection or repaired with invented prices. The current candidate passed the real-model gate before deployment; the latest production blocker is quota exhaustion.

## Technical checks and limits

657 unit tests passed. All workspace type checks, the unified production build and Worker bundle were checked locally; subsequent server changes passed server type checks and Worker builds. The 100-job mock pipeline completed with 100 calls and no duplicate itineraries. These are technical checks, not production generation certification.

Cloudflare has real inference evidence. Claude, OpenAI and Gemini have adapter contract tests but **no live credential verification**. BYOK and token purchases remain deferred. Quota UI changes are in the PR; the production web release is still pending merge.

Local evidence is under `test-results/production-generation/` (ignored): `compare-abd7a6e-failed.json`, `compare-49f8fea-failed.json`, `reconciled-v1-original.json`, `resume-wide-49f8fea.json`, and `final-health.json`. The synthetic test account credentials are excluded. Candidate model reports are under `test-results/generation-v2-live/`.

## Remaining release gate

After provider quota recovers (or a separately authorized backend provider is configured and tested), use fresh CI test submissions to run one bounded comparison; never replay the exhausted dispatch ticket. Both V2 controls must complete, and the original payload must complete or produce a concrete constraint rejection. Restore GitHub runner billing for the automated workflow; the same manual production gates remain available. Only after the comparison passes may rollout reach 100%, followed by an ordinary API V2 job without an override. Keep Queue bindings and the 0% compensation path if verification fails. No new feature PR is needed just to change the rollout configuration.
