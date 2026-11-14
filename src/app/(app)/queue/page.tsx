import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default function QueuePage() {
  return (
    <>
      <RouteSync tab="queue" />
      <MainContent />
    </>
  );
}