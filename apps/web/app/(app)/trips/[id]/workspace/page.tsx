import type { Metadata } from "next";
import { TripWorkspace } from "../../../../../components/trips/TripWorkspace";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export const metadata: Metadata = {
  title: "Trip Workspace",
};

export default async function TripWorkspacePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <TripWorkspace key={`${id}:${tab ?? ""}`} tripId={id} initialTab={tab} />;
}
