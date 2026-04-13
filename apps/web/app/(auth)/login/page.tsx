import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthExperience } from "@/components/auth/AuthExperience";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Login - Horizon" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/plan");

  return <AuthExperience mode="login" />;
}
