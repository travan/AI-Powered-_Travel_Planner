import type { Metadata } from "next";
import { ResetPasswordCard } from "@/components/auth/ResetPasswordCard";

export const metadata: Metadata = { title: "Reset Password" };

export default function ResetPasswordPage() {
  return <ResetPasswordCard />;
}
