import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default async function CustomPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <RouteSync tab="playlist" entityId={id} />
      <MainContent />
    </>
  );
}