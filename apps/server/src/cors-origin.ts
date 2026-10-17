export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
  allowQuickTunnelOrigins: boolean
): boolean {
  if (!origin || allowedOrigins.has(origin)) return true;

  return allowQuickTunnelOrigins && /^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(origin);
}
