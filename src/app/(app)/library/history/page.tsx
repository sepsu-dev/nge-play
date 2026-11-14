import { MainContent } from "@/app/(app)/main-content";
import { RouteSync } from "@/app/(app)/route-sync";

export default function HistoryPage() {
  return (
    <>
      <RouteSync tab="history" />
      <MainContent />
    </>
  );
}