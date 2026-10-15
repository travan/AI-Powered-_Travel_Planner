import { createClient } from "./supabase/client";
import { MOCK_AUTH_ENABLED } from "./supabase/mock-auth";

async function post(path: string, body: Record<string, string>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : "Password recovery failed. Please try again.",
    );
  }
}

export async function requestPasswordRecovery(email: string) {
  if (MOCK_AUTH_ENABLED) {
    const { error } = await createClient().auth.resetPasswordForEmail(email);
    if (error) throw error;
    return;
  }
  await post("forgot-password", { email });
}

export async function completePasswordRecovery(
  token: string,
  password: string,
) {
  if (MOCK_AUTH_ENABLED) {
    const { error } = await createClient().auth.updateUser({ password });
    if (error) throw error;
    return;
  }
  await post("reset-password", { token, password });
}
