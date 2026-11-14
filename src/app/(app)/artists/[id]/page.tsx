import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default async function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <RouteSync tab="artists" entityId={decodeURIComponent(id)} />
      <MainContent />
    </>
  );
}