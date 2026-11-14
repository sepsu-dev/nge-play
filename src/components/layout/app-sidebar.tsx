"use client";

import { Disc3, Headphones, Home, ListMusic, Users } from "lucide-react";
import type { TabId } from "@/lib/player-state";

interface AppSidebarProps {
  tab: TabId;
  likedCount: number;
  onSelectTab: (tab: TabId) => void;
}

export function AppSidebar({ tab, likedCount, onSelectTab }: AppSidebarProps) {
  const navItems: { id: TabId; label: string; icon: typeof Home; badge?: number }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "songs", label: "Songs", icon: Headphones },
    { id: "albums", label: "Albums", icon: Disc3 },
    { id: "artists", label: "Artists", icon: Users },
    // Liked, History, dan playlist digabung di satu menu Library
    { id: "library", label: "Library", icon: ListMusic, badge: likedCount || undefined },
  ];

  // Library menaungi liked/history/playlist, jadi detail playlist tetap menyalakan menu Library.
  const isItemActive = (id: TabId) =>
    id === "library"
      ? tab === "library" || tab === "liked" || tab === "history" || tab === "playlist"
      : tab === id;

  return (
    <aside className="hidden lg:flex w-[228px] shrink-0 flex-col py-5 px-5 sticky top-[72px] self-start max-h-[calc(100vh-156px)] overflow-y-auto">
      <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3.5 mb-2.5">
        Music
      </p>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-[13px] transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                active
                  ? "bg-gradient-to-r from-[#FFCE00] to-[#FFD93B] text-[#18181B] font-bold shadow-[0_8px_20px_rgba(255,206,0,0.28)]"
                  : "text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F7F8FA] dark:hover:bg-[#161922] font-medium"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.badge ? (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                    active
                      ? "bg-black/10 text-[#18181B]"
                      : "bg-[#F3F4F6] dark:bg-[#1E222D] text-[#6B7280] dark:text-[#9CA3AF]"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
