import { createClient } from "@supabase/supabase-js";
import { MOBILE_SUPABASE_PUBLIC_ENV_SPEC, resolveSupabasePublicConfig } from "@travel/types";
import * as SecureStore from "expo-secure-store";
import { createMockSupabaseClient, isMockAuthEnabled } from "./mock-auth";

const resolved = resolveSupabasePublicConfig(process.env, MOBILE_SUPABASE_PUBLIC_ENV_SPEC);
export { isMockAuthEnabled };
export const isSupabaseConfigured = isMockAuthEnabled || resolved.ok;
export const SUPABASE_CONFIG_ERROR =
  resolved.errorMessage ??
  "Supabase is not configured for mobile. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = isSupabaseConfigured
  ? isMockAuthEnabled
    ? createMockSupabaseClient()
    : createClient(resolved.config!.url, resolved.config!.key, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }

  return supabase;
}
