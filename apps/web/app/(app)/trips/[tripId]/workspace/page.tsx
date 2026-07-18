import type { Metadata } from "next";
import { TripWorkspace } from "../../../../../components/trips/TripWorkspace";

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export const metadata: Metadata = {
  title: "Trip Workspace",
};

export default async function TripWorkspacePage({ params }: PageProps) {
  const { tripId } = await params;
  return <TripWorkspace tripId={tripId} />;
}
