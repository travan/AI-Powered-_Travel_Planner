import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LegacyTripDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/trips/${id}/workspace`);
}
