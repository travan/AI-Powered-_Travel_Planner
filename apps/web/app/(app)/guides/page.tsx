import { UiText } from "../../../components/i18n/UiText";
import { SiteHeader } from "../../../components/layout/SiteHeader";

export default function GuidesPage() {
  return (
    <div className="bg-background text-on-surface min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
            {" "}
            <UiText id="t929a28d26142" fallback="Guides" />{" "}
          </p>
          <h1
            className="font-headline text-4xl font-extrabold tracking-tight text-on-surface"
            data-testid="web-guides-page-title"
          >
            {" "}
            <UiText id="tbe082f2c4ace" fallback="Travel guides" />{" "}
          </h1>
          <p
            className="text-on-surface-variant"
            data-testid="web-guides-page-state"
          >
            {" "}
            <UiText
              id="tb437af158d9d"
              fallback="Curated destination guides are coming soon."
            />{" "}
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
    </div>
  );
}
