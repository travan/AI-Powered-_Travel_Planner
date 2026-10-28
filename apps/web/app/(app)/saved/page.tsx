import { UiText } from "../../../components/i18n/UiText";
import { createClient } from "@/lib/supabase/server";

export default async function SavedTripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
          {" "}
          <UiText id="td9dbcdb5e472" fallback="Saved Trips" />{" "}
        </p>
        <h1
          className="font-headline text-4xl font-extrabold tracking-tight text-on-surface"
          data-testid="web-saved-page-title"
        >
          {" "}
          <UiText id="t9290cc774ee5" fallback="Your saved escapes" />{" "}
        </h1>
        <p
          className="text-on-surface-variant"
          data-testid="web-saved-page-state"
        >
          {user ? (
            `Signed in as ${user.email ?? "traveler"}`
          ) : (
            <UiText id="ta547577663ec" fallback="No account session found." />
          )}
        </p>
      </header>

      <a
        href="/plan"
        className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary transition hover:brightness-105"
      >
        {" "}
        <UiText id="t2940253eb060" fallback="Plan a new trip" />{" "}
      </a>
    </main>
  );
}
