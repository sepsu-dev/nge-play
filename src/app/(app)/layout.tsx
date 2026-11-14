import { AppShell } from "@/app/(app)/app-shell";
import { PlayerProvider } from "@/app/(app)/player-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <AppShell>{children}</AppShell>
    </PlayerProvider>
  );
}