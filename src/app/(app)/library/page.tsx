import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default function LibraryPage() {
  return (
    <>
      <RouteSync tab="library" />
      <MainContent />
    </>
  );
}