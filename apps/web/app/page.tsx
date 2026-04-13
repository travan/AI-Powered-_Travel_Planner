import { redirect } from "next/navigation";
import Link from "next/link";

export default function LandingPage() {
  redirect("/plan");

  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm text-brand-700 ring-1 ring-brand-200">
          AI-Powered • Multi-City • Real-time
        </div>

        <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          Plan your perfect trip{" "}
          <span className="text-brand-600">in seconds</span>
        </h1>

        <p className="max-w-xl text-lg text-gray-600">
          Enter your cities, travel dates, and budget. Our AI builds a complete
          day-by-day itinerary with hotels, restaurants, activities, and booking
          links — all in one place.
        </p>

        <div className="flex gap-4">
          <Link href="/plan">
            <span className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700">
              Start Planning - It&apos;s Free
            </span>
          </Link>
          <Link href="/plan">
            <span className="inline-flex rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50">
              See an Example
            </span>
          </Link>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="border-t border-gray-200 bg-white px-4 py-16">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const features = [
  {
    icon: "🗺️",
    title: "Multi-city routes",
    description:
      "Add multiple cities and we automatically optimize the order and distribute days intelligently.",
  },
  {
    icon: "💰",
    title: "Budget-aware",
    description:
      "Set your budget and get a full cost breakdown: accommodation, food, activities, and transport.",
  },
  {
    icon: "🌅",
    title: "Seasonal intelligence",
    description:
      "Get sunrise/sunset times, weather notes, and golden-hour tips tailored to your travel dates.",
  },
  {
    icon: "🏨",
    title: "Direct booking links",
    description:
      "Hotels on Booking.com & Airbnb. Tours on Klook, Traveloka, and Trip.com. One-click access.",
  },
  {
    icon: "🚆",
    title: "Transport options",
    description:
      "Train, bus, flight, self-drive — all compared with prices and booking links per city pair.",
  },
  {
    icon: "📱",
    title: "Mobile app included",
    description:
      "Take your itinerary on the go with the iOS & Android app. Access offline, share with friends.",
  },
];
