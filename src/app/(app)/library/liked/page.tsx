import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default function LikedPage() {
  return (
    <>
      <RouteSync tab="liked" />
      <MainContent />
    </>
  );
}