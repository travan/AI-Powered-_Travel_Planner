import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

// Service-role client for server-side operations (bypasses RLS)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
