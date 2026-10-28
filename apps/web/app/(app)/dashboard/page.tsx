import { UiText } from "../../../components/i18n/UiText";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
          {" "}
          <UiText id="td87f47b47e4d" fallback="Dashboard" />{" "}
        </p>
        <h1
          className="font-headline text-4xl font-extrabold tracking-tight text-on-surface"
          data-testid="web-dashboard-page-title"
        >
          {" "}
          <UiText id="td78b6db173bf" fallback="Traveler dashboard" />{" "}
        </h1>
        <p
          className="text-on-surface-variant"
          data-testid="web-dashboard-page-state"
        >
          {user ? (
            `Welcome back, ${user.email ?? "traveler"}.`
          ) : (
            <UiText id="ta547577663ec" fallback="No account session found." />
          )}
        </p>
      </header>
    </main>
  );
}
