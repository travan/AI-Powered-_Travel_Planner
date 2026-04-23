import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { createMockSupabaseClient, isMockAuthEnabled } from "./mock-auth";

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const supabaseAnonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
export { isMockAuthEnabled };
export const isSupabaseConfigured = isMockAuthEnabled || Boolean(supabaseUrl && supabaseAnonKey);
export const SUPABASE_CONFIG_ERROR =
  "Supabase is not configured for mobile. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = isSupabaseConfigured
  ? isMockAuthEnabled
    ? createMockSupabaseClient()
    : createClient(supabaseUrl, supabaseAnonKey, {
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
