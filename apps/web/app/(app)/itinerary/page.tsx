import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    id?: string;
    itinerary_id?: string;
  }>;
}

export default async function ItineraryIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const itineraryId = params.id ?? params.itinerary_id;

  if (itineraryId?.trim()) {
    redirect(`/itinerary/${encodeURIComponent(itineraryId.trim())}`);
  }

  redirect("/plan");
}
