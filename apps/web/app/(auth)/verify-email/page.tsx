import type { Metadata } from "next";
import { VerifyEmailCard } from "@/components/auth/VerifyEmailCard";

export const metadata: Metadata = { title: "Verify Email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  // Sanitize: only pass a plain email string, never arbitrary user-controlled HTML
  const email =
    typeof params.email === "string" && params.email.includes("@")
      ? params.email
      : "";

  return <VerifyEmailCard email={email} />;
}
