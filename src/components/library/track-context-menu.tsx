"use client";

import { Check, Plus } from "lucide-react";
import type { Track } from "@/actions/youtube";
import type { CustomPlaylist, TrackMenuState } from "@/lib/player-state";

interface TrackContextMenuProps {
  menu: TrackMenuState | null;
  liked: Track[];
  customPlaylists: CustomPlaylist[];
  onClose: () => void;
  onPlayNow: (track: Track) => void;
  onToggleLike: (track: Track) => void;
  onOpenArtist: (track: Track, e: React.MouseEvent) => void;
  onRemoveFromPlaylist: (playlistId: string, trackId: string) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onNewPlaylist: () => void;
}

export function TrackContextMenu({
  menu,
  liked,
  customPlaylists,
  onClose,
  onPlayNow,
  onToggleLike,
  onOpenArtist,
  onRemoveFromPlaylist,
  onAddToPlaylist,
  onNewPlaylist,
}: TrackContextMenuProps) {
  if (!menu) return null;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      className="fixed z-50 w-52 bg-white dark:bg-[#161922] rounded-2xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] py-1.5 text-xs np-pop-enter origin-top-right"
    >
      {!menu.playlistOnly && (
        <>
          <button
            onClick={() => {
              onPlayNow(menu.track);
              onClose();
            }}
            className="w-full px-3.5 py-2 text-left font-medium text-[#18181B] dark:text-[#F4F5F7] hover:bg-[#F7F8FA] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
          >
            Play now
          </button>
          <button
            onClick={() => {
              onToggleLike(menu.track);
              onClose();
            }}
            className="w-full px-3.5 py-2 text-left font-medium text-[#18181B] dark:text-[#F4F5F7] hover:bg-[#F7F8FA] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
          >
            {liked.some((t) => t.id === menu.track.id) ? "Remove from Liked" : "Add to Liked"}
          </button>
          <button
            onClick={(e) => {
              onOpenArtist(menu.track, e);
              onClose();
            }}
            className="w-full px-3.5 py-2 text-left font-medium text-[#18181B] dark:text-[#F4F5F7] hover:bg-[#F7F8FA] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
          >
            Open artist
          </button>
          {menu.customPlaylistId && (
            <button
              onClick={() => {
                onRemoveFromPlaylist(menu.customPlaylistId!, menu.track.id);
                onClose();
              }}
              className="w-full px-3.5 py-2 text-left font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              Remove from playlist
            </button>
          )}
        </>
      )}
      <div
        className={
          menu.playlistOnly
            ? ""
            : "border-t border-black/[0.05] dark:border-white/[0.07] mt-1 pt-1"
        }
      >
        <p className="px-3.5 py-1 text-[11px] font-semibold text-[#9CA3AF]">
          {menu.playlistOnly ? "Save to playlist" : "Add to playlist"}
        </p>
        {customPlaylists.map((pl) => {
          const exists = pl.tracks.some((t) => t.id === menu.track.id);
          return (
            <button
              key={pl.id}
              onClick={() => {
                onAddToPlaylist(pl.id, menu.track);
                onClose();
              }}
              className="w-full px-3.5 py-1.5 text-left text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 flex items-center justify-between gap-2 transition-colors cursor-pointer"
            >
              <span className="truncate">{pl.name}</span>
              {exists && <Check className="w-3.5 h-3.5 text-[#FFD014] shrink-0" />}
            </button>
          );
        })}
        <button
          onClick={() => {
            onClose();
            onNewPlaylist();
          }}
          className="w-full px-3.5 py-1.5 mt-0.5 text-left font-semibold text-[#B45309] dark:text-[#FFD014] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>New playlist</span>
        </button>
      </div>
    </div>
  );
}
