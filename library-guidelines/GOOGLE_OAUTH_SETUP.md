# Google OAuth Setup

Last verified against the repository: 2026-07-27.

Google OAuth is optional. In the current application it is provided through
Supabase Auth; the default local web-auth provider supports email/password only.

## When to configure it

Use Google OAuth only when:

- the web provider is explicitly set to `supabase`; or
- the Expo client is using a real Supabase project.

No Google or Supabase credential is required for the default Playwright suite.

## Supabase dashboard

1. Open the target Supabase project.
2. Enable Google under Authentication providers.
3. Copy the Google callback URL shown by Supabase.
4. Add that URL as an authorized redirect URI in the Google Cloud OAuth client.
5. Put the Google client ID and client secret into the Supabase provider form.

For a local web app, allow the application callback:

```text
http://localhost:3000/auth/callback
```

For production, allow the HTTPS equivalent on the real public origin. Keep the
Supabase callback shown in its dashboard in Google Cloud as well; the exact
Supabase hostname is project-specific.

## Web environment

```dotenv
AUTH_PROVIDER=supabase
NEXT_PUBLIC_AUTH_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` remains accepted for projects using legacy key
names. Set one public key, not the service-role key.

Restart the Next process after changing public environment variables because
they are embedded into the client build.

## Mobile environment

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-key
EXPO_PUBLIC_WEB_URL=http://localhost:3000
```

For native builds, register the application’s deep-link/callback URL in both
Supabase and the provider configuration used by the released app. Validate on a
real release-like build; an Expo development URL is not a production callback.

## Application flow

1. The client calls Supabase `signInWithOAuth` for Google.
2. Google authenticates the user and returns through Supabase.
3. Supabase redirects the browser to `/auth/callback?code=...`.
4. The callback route exchanges the code for a session.
5. The route redirects to the validated internal `next` path.

Never accept an unvalidated external `next` URL.

## Troubleshooting

- **Supabase is not configured**: Supabase mode was selected without a URL and
  public key. Either provide them or set both web provider flags back to
  `local`.
- **Provider disabled**: enable Google in the Supabase dashboard.
- **Redirect mismatch**: compare scheme, host, port, path, and trailing slash in
  Google Cloud, Supabase, and the app environment.
- **Local login works but Google does not**: expected if the provider remains
  `local`; switch explicitly to Supabase mode.
- **E2E unexpectedly opens Google**: the Playwright environment is wrong.
  Standard E2E must use mock auth and must not contact OAuth.

## Security checklist

- Keep the Google client secret only in Google/Supabase secret configuration.
- Keep `SUPABASE_SERVICE_KEY` server-only.
- Use HTTPS for production callbacks.
- Limit redirect destinations to trusted origins.
- Rotate leaked credentials and invalidate affected sessions.
- Test a different signed-in user when validating trip invite links; the host
  cannot consume their own invitation as a new member.
