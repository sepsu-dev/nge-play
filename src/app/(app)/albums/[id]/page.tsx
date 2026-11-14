import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default async function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <RouteSync tab="albums" entityId={decodeURIComponent(id)} />
      <MainContent />
    </>
  );
}