"use client";

import { X } from "lucide-react";
import type { Track } from "@/actions/youtube";
import type { TrackMenuState } from "@/hooks/use-nge-play";
import type { CustomPlaylist } from "@/lib/player-state";

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
}: TrackContextMenuProps) {
  if (!menu) return null;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      className="fixed z-50 w-52 bg-white dark:bg-[#161922] rounded-2xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] py-1.5 text-xs np-pop-enter origin-top-right"
    >
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
      {customPlaylists.length > 0 && (
        <div className="border-t border-black/[0.05] dark:border-white/[0.07] mt-1 pt-1">
          <p className="px-3.5 py-1 text-[11px] font-semibold text-[#9CA3AF]">
            Add to playlist
          </p>
          {customPlaylists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => {
                onAddToPlaylist(pl.id, menu.track);
                onClose();
              }}
              className="w-full px-3.5 py-1.5 text-left text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 truncate transition-colors cursor-pointer"
            >
              {pl.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface NewPlaylistModalProps {
  open: boolean;
  name: string;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function NewPlaylistModal({
  open,
  name,
  onNameChange,
  onClose,
  onCreate,
}: NewPlaylistModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 np-backdrop-enter"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
        }}
        className="w-full max-w-sm bg-white dark:bg-[#161922] rounded-3xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-6 space-y-4 np-pop-enter"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#18181B] dark:text-white">New Playlist</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Playlist name..."
          className="w-full h-10 px-4 rounded-full bg-[#F4F5F7] dark:bg-[#0D0F14] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014] text-sm text-[#18181B] dark:text-white focus:outline-none transition-colors"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-full text-xs font-bold bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] transition-transform active:scale-95 cursor-pointer"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
