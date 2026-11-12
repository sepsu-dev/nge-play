"use client";

import { Clock, Heart, ListMusic, ListPlus } from "lucide-react";
import { TrackCover } from "@/components/ui/track-cover";
import type { CustomPlaylist } from "@/lib/player-state";

export function LibraryView({
  hydrating = false,
  likedCount,
  historyCount,
  customPlaylists,
  onOpenLiked,
  onOpenHistory,
  onOpenPlaylist,
  onOpenNewPlaylist,
}: {
  hydrating?: boolean;
  likedCount: number;
  historyCount: number;
  customPlaylists: CustomPlaylist[];
  onOpenLiked: () => void;
  onOpenHistory: () => void;
  onOpenPlaylist: (id: string) => void;
  onOpenNewPlaylist: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
          Library
        </h1>
        <button
          type="button"
          onClick={onOpenNewPlaylist}
          className="bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] text-xs font-bold px-4 py-2 rounded-full shadow-[0_6px_16px_rgba(255,208,20,0.28)] flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
        >
          <ListPlus className="w-3.5 h-3.5" />
          <span>New Playlist</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onOpenLiked}
          className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#F1F3F6] dark:hover:bg-[#1B1F2A] text-left transition-colors active:scale-[0.98] cursor-pointer"
        >
          <span className="w-10 h-10 rounded-xl bg-[#FFF3BF] dark:bg-[#FFD014]/15 text-[#B45309] dark:text-[#FFD014] flex items-center justify-center shrink-0">
            <Heart className="w-4 h-4 fill-current" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#18181B] dark:text-white truncate">Liked</p>
            {hydrating ? (
              <div className="h-3 w-12 mt-1 rounded bg-[#EAECEF] dark:bg-[#1E222D] animate-pulse" />
            ) : (
              <p className="text-xs text-[#9CA3AF]">{likedCount} tracks</p>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#F1F3F6] dark:hover:bg-[#1B1F2A] text-left transition-colors active:scale-[0.98] cursor-pointer"
        >
          <span className="w-10 h-10 rounded-xl bg-[#EAECEF] dark:bg-[#1E222D] text-[#4B5563] dark:text-[#9CA3AF] flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#18181B] dark:text-white truncate">History</p>
            {hydrating ? (
              <div className="h-3 w-12 mt-1 rounded bg-[#EAECEF] dark:bg-[#1E222D] animate-pulse" />
            ) : (
              <p className="text-xs text-[#9CA3AF]">{historyCount} tracks</p>
            )}
          </div>
        </button>
      </div>

      <section className="space-y-2.5">
        <p className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF] dark:text-[#6B7280]">
          Playlists
        </p>
        {hydrating ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-2xl animate-pulse">
                <div className="w-11 h-11 rounded-xl bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3.5 w-2/5 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
                  <div className="h-3 w-1/5 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
                </div>
              </div>
            ))}
          </div>
        ) : customPlaylists.length === 0 ? (
          <div className="rounded-2xl bg-[#F7F8FA] dark:bg-[#161922] py-10 px-4 text-center text-xs text-[#9CA3AF] dark:text-[#6B7280]">
            No playlists yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {customPlaylists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => onOpenPlaylist(pl.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-[#F7F8FA] dark:hover:bg-[#161922] text-left transition-colors active:scale-[0.99] cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#F3F4F6] dark:bg-[#1E222D] flex items-center justify-center shrink-0">
                  {pl.tracks[0] ? (
                    <TrackCover
                      src={pl.tracks[0].thumbnail}
                      trackId={pl.tracks[0].id}
                      alt={pl.name}
                      lazy
                    />
                  ) : (
                    <ListMusic className="w-4 h-4 text-[#9CA3AF]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#18181B] dark:text-white truncate">
                    {pl.name}
                  </p>
                  <p className="text-xs text-[#9CA3AF]">{pl.tracks.length} tracks</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
