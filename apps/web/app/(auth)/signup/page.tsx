import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthExperience } from "@/components/auth/AuthExperience";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign-up - Horizon" };

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/plan");

  return <AuthExperience mode="signup" />;
}
