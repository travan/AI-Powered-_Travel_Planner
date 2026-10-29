export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ACCESS_COOKIE = "horizon_local_auth";
export const REFRESH_COOKIE = "horizon_local_refresh";
export type SessionTokens = {
  userId: string;
  token: string;
  refreshToken: string;
};
