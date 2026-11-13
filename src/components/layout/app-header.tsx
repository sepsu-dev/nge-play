"use client";

import { Radio, Search, Users, X } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import type { RoomState } from "@/lib/room";

interface AppHeaderProps {
  query: string;
  room: RoomState | null;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  onClearSearch: () => void;
  onLogoClick: () => void;
  onOpenRoom: () => void;
}

export function AppHeader({
  query,
  room,
  onQueryChange,
  onSearch,
  onClearSearch,
  onLogoClick,
  onOpenRoom,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-md border-b border-black/[0.04] dark:border-white/[0.06] px-4 sm:px-8 py-4 flex items-center justify-between gap-4 shrink-0">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2.5 lg:w-[200px] cursor-pointer group shrink-0"
      >
        <svg
          className="w-7 h-7 shrink-0 drop-shadow-[0_4px_10px_rgba(255,208,20,0.45)] transition-transform duration-200 group-hover:scale-105"
          viewBox="0 0 32 32"
          fill="none"
        >
          <path
            d="M7 6.8C7 4.45 9.62 3.05 11.58 4.35L25.4 13.55C27.15 14.71 27.15 17.29 25.4 18.45L11.58 27.65C9.62 28.95 7 27.55 7 25.2V6.8Z"
            fill="#FFD014"
          />
        </svg>
        <span className="font-extrabold text-[17px] tracking-tight text-[#18181B] dark:text-white">
          Nge-Plays
        </span>
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(query);
        }}
        className="relative flex-1 max-w-xl"
      >
        <Search className="w-4 h-4 text-[#B0B7C3] dark:text-[#6B7280] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search for songs, artists, albums, etc..."
          className="w-full h-10 bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#EFEFF2] dark:hover:bg-[#1B1F2A] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014]/70 rounded-full pl-11 pr-9 text-xs sm:text-[13px] text-[#18181B] dark:text-[#F4F5F7] placeholder:text-[#9CA3AF] focus:outline-none transition-all"
        />
        {query && (
          <Tip label="Clear search" side="bottom">
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </Tip>
        )}
      </form>

      <div className="flex items-center justify-end gap-2 lg:w-[200px] shrink-0">
        <Tip label={room ? `Room ${room.code}` : "Listen Together"} side="bottom">
          <button
            type="button"
            onClick={onOpenRoom}
            aria-label={room ? `Room ${room.code}` : "Listen Together"}
            className={`h-10 px-3.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
              room
                ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 border border-[#FFD014]/50 text-[#B45309] dark:text-[#FFD014]"
                : "bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1B1F2A] text-[#4B5563] dark:text-[#D1D5DB]"
            }`}
          >
            {room ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#FFD014] animate-pulse shrink-0" />
                <span className="tracking-wider">{room.code}</span>
                <span className="inline-flex items-center gap-1 opacity-80 font-semibold">
                  <Users className="w-3.5 h-3.5" />
                  {room.memberCount}
                </span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4 text-[#FFD014] shrink-0" />
                <span className="hidden sm:inline">Room</span>
              </>
            )}
          </button>
        </Tip>
      </div>
    </header>
  );
}
