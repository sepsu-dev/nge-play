"use client";

import {
  Clock,
  Disc3,
  Headphones,
  Heart,
  Home,
  ListMusic,
  ListPlus,
  Users,
} from "lucide-react";
import type { CustomPlaylist, TabId } from "@/lib/player-state";

interface AppSidebarProps {
  tab: TabId;
  hydrating?: boolean;
  likedCount: number;
  customPlaylists: CustomPlaylist[];
  activeCustomPlId: string;
  onSelectTab: (tab: TabId) => void;
  onSelectCustomPlaylist: (id: string) => void;
  onOpenNewPlaylist: () => void;
}

export function AppSidebar({
  tab,
  hydrating = false,
  likedCount,
  customPlaylists,
  activeCustomPlId,
  onSelectTab,
  onSelectCustomPlaylist,
  onOpenNewPlaylist,
}: AppSidebarProps) {
  const navItems: { id: TabId; label: string; icon: typeof Home; badge?: number }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "songs", label: "Songs", icon: Headphones },
    { id: "albums", label: "Albums", icon: Disc3 },
    { id: "artists", label: "Artists", icon: Users },
    { id: "liked", label: "Liked", icon: Heart, badge: likedCount || undefined },
    { id: "history", label: "History", icon: Clock },
  ];

  return (
    <aside className="hidden lg:flex w-[228px] shrink-0 flex-col py-5 px-5 sticky top-[72px] self-start max-h-[calc(100vh-156px)] overflow-y-auto">
      <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3.5 mb-2.5">
        Music
      </p>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
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

      <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3.5 mt-7 mb-2.5">
        Playlists
      </p>
      <div className="space-y-1">
        {hydrating
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-9 rounded-full bg-[#F7F8FA] dark:bg-[#161922] animate-pulse"
              />
            ))
          : customPlaylists.map((pl) => {
              const active = tab === "playlist" && activeCustomPlId === pl.id;
              return (
                <button
                  key={pl.id}
                  onClick={() => onSelectCustomPlaylist(pl.id)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2 rounded-full text-[13px] transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                    active
                      ? "bg-gradient-to-r from-[#FFCE00] to-[#FFD93B] text-[#18181B] font-bold shadow-[0_8px_20px_rgba(255,206,0,0.28)]"
                      : "text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F7F8FA] dark:hover:bg-[#161922] font-medium"
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <ListMusic className="w-4 h-4 shrink-0" />
                    <span className="truncate">{pl.name}</span>
                  </span>
                  <span className="text-[10px] opacity-60 shrink-0">{pl.tracks.length}</span>
                </button>
              );
            })}

        <button
          onClick={onOpenNewPlaylist}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-full text-[13px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F7F8FA] dark:hover:bg-[#161922] transition-colors cursor-pointer"
        >
          <ListPlus className="w-4 h-4 shrink-0" />
          <span>New Playlist</span>
        </button>
      </div>
    </aside>
  );
}
