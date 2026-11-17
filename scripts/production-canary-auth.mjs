/** Tokens stay in this process, never printed or written into CI reports. */
export async function canarySession(
  base,
  { register = false, request = fetch } = {},
) {
  const email = process.env.PLANNING_CANARY_EMAIL;
  const password = process.env.PLANNING_CANARY_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Dedicated PLANNING_CANARY_EMAIL/PASSWORD secrets are required",
    );
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Client": "mobile" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  };
  let response = await request(new URL("/api/auth/session", base), options);
  if (register && response.status === 401)
    response = await request(new URL("/api/auth/register", base), {
      ...options,
      signal: AbortSignal.timeout(20_000),
    });
  if (!response.ok)
    throw new Error(`Canary authentication failed (HTTP ${response.status})`);
  let session = await response.json();
  if (!session.session?.access_token || !session.user?.id)
    throw new Error("Unexpected canary session contract");
  return {
    userId: session.user.id,
    async json(path, init = {}) {
      const send = () =>
        request(new URL(path, base), {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...init.headers,
            Authorization: `Bearer ${session.session.access_token}`,
          },
          signal: AbortSignal.timeout(30_000),
        });
      let result = await send();
      if (result.status === 401 && session.session.refresh_token) {
        const refresh = await request(new URL("/api/auth/refresh", base), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Client": "mobile",
          },
          body: JSON.stringify({
            refresh_token: session.session.refresh_token,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!refresh.ok) throw new Error("Canary session refresh failed");
        session = await refresh.json();
        result = await send();
      }
      if (!result.ok)
        throw new Error(`Canary API ${path} failed (HTTP ${result.status})`);
      return result.json();
    },
  };
}
