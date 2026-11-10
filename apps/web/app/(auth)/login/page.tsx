import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthExperience } from "@/components/auth/AuthExperience";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo =
    params.redirectTo && params.redirectTo.startsWith("/") && !params.redirectTo.startsWith("//")
      ? params.redirectTo
      : "/plan";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !params.error?.startsWith("google_")) redirect(redirectTo);

  return <AuthExperience mode="login" />;
}
