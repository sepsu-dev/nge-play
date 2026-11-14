import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default function SongsPage() {
  return (
    <>
      <RouteSync tab="songs" />
      <MainContent />
    </>
  );
}