import { Platform } from "react-native";
import { joinApiUrl, resolveApiBaseUrl } from "@travel/api-client";

const DEFAULT_API_URL = Platform.OS === "android"
  ? "http://10.0.2.2:3001"
  : "http://localhost:3001";

export const MOBILE_API_BASE_URL = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  DEFAULT_API_URL,
);

export function mobileApiUrl(path: string) {
  return joinApiUrl(MOBILE_API_BASE_URL, path);
}
