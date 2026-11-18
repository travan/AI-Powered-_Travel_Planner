# AI fallback sources

V2 can use a configurable, ordered list of up to five fallback sources after a
definitive quota rejection. Cloudflare remains the primary provider. A timeout,
unknown result, authentication error or other provider error does not trigger
another source. One durable dispatch ticket covers the complete sequence; a
redelivered queue message does not repeat it.

Configure the backend variable `AI_FALLBACK_PROVIDERS` as JSON. Each entry has a
safe unique `id`, `provider`, `model` and `key_env` containing the **name** of a
Worker secret, never the secret value. Example:

```json
[
  {"id":"gemini-first","provider":"gemini","model":"gemini-2.5-flash","key_env":"GEMINI_API_KEY"},
  {"id":"gemini-second","provider":"gemini","model":"gemini-2.5-flash","key_env":"GEMINI_API_KEY_2"},
  {"id":"openai-example","provider":"openai","model":"CONFIGURED_MODEL","key_env":"OPENAI_API_KEY"}
]
```

Supported fallback providers are `gemini`, `openai`, and `claude`. Secret names
must begin with `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`
respectively, optionally followed by an uppercase suffix. Configure each as an
encrypted secret on the `travel-planner-api` Worker. Set the GitHub Actions
variable `AI_FALLBACK_PROVIDERS` to the same JSON so subsequent deployments keep
the source list; manual deployment uses `DEPLOY_AI_FALLBACK_PROVIDERS`. Invalid
configuration fails preflight. Deployment checks that every configured key is an
encrypted Worker secret. If a secret later becomes unavailable, that source is
skipped with a warning without preventing the primary provider from working.

Source usage records include the source ID, provider, model and outcome, not the
API key. Existing jobs with a recorded response reuse it; unknown outcomes never
trigger fallback on resume. A free-tier key does not guarantee availability or
that another account uses an independent quota. Provider billing and data-use
policies must be checked for every configured account.
