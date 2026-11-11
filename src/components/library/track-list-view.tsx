"use client";

import { ArrowLeft, Heart, Loader2, MoreVertical, Pause, Play, Trash2 } from "lucide-react";
import type {
  AlbumSummary,
  ArtistSummary,
  ChannelInfo,
  Track,
  YouTubePlaylist,
} from "@/actions/youtube";
import { TrackCover } from "@/components/library/track-cover";
import { formatTime, parseDurationSec } from "@/lib/format";
import type { CustomPlaylist, TabId } from "@/lib/player-state";

interface TrackListViewProps {
  tab: TabId;
  searching: boolean;
  displayedTracks: Track[];
  currentTrack: Track | undefined;
  isPlaying: boolean;
  liked: Track[];
  playlists: YouTubePlaylist[];
  activePlaylistId: string;
  heroTitle: string;
  activeAlbum: { album: AlbumSummary; tracks: Track[] } | null;
  channelInfo: ChannelInfo | null;
  channelCont: string | undefined;
  loadingMore: boolean;
  activeCustomPlaylist: CustomPlaylist | undefined;
  queueLength: number;
  onBack: () => void;
  onPlayAll: (tracks: Track[]) => void;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onTogglePlay: () => void;
  onOpenArtist: (target: Track | ArtistSummary | string, e?: React.MouseEvent) => void;
  onToggleLike: (track: Track, e?: React.MouseEvent) => void;
  onOpenMenu: (track: Track, e: React.MouseEvent, customPlaylistId?: string) => void;
  onSelectPlaylist: (pl: YouTubePlaylist) => void;
  onDeleteCustomPlaylist: (id: string) => void;
  onClearQueue: () => void;
  onLoadMoreChannel: () => void;
}

export function TrackListView({
  tab,
  searching,
  displayedTracks,
  currentTrack,
  isPlaying,
  liked,
  playlists,
  activePlaylistId,
  heroTitle,
  activeAlbum,
  channelInfo,
  channelCont,
  loadingMore,
  activeCustomPlaylist,
  queueLength,
  onBack,
  onPlayAll,
  onPlayTrack,
  onTogglePlay,
  onOpenArtist,
  onToggleLike,
  onOpenMenu,
  onSelectPlaylist,
  onDeleteCustomPlaylist,
  onClearQueue,
  onLoadMoreChannel,
}: TrackListViewProps) {
  const totalSec = displayedTracks.reduce((acc, t) => acc + parseDurationSec(t.duration), 0);
  const heroCover =
    (tab === "artists" && channelInfo?.avatar) ||
    (tab === "albums" && activeAlbum?.album.thumbnail) ||
    displayedTracks[0]?.thumbnail ||
    currentTrack?.thumbnail;
  const sectionTitle =
    tab === "artists" && channelInfo
      ? channelInfo.title
      : tab === "albums" && activeAlbum
      ? activeAlbum.album.title
      : tab === "songs"
      ? heroTitle
      : tab === "queue"
      ? "Play Queue"
      : tab === "liked"
      ? "Liked Songs"
      : tab === "history"
      ? "History"
      : tab === "playlist"
      ? activeCustomPlaylist?.name || "Playlist"
      : "Discover";

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3.5 min-w-0">
          {((tab === "albums" && activeAlbum) || (tab === "artists" && channelInfo)) && (
            <button
              onClick={onBack}
              title="Back"
              className="p-2 rounded-full bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1E222D] text-[#18181B] dark:text-white transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] border border-black/[0.05] dark:border-white/[0.08] shrink-0">
            <TrackCover
              src={heroCover}
              trackId={
                tab === "artists" && channelInfo?.avatar
                  ? undefined
                  : displayedTracks[0]?.id || currentTrack?.id
              }
              alt={sectionTitle}
              iconClass="w-5 h-5"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#18181B] dark:text-white truncate">
              {sectionTitle}
            </h1>
            <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 flex flex-wrap items-center gap-1.5 truncate">
              {tab === "artists" && channelInfo ? (
                <span>
                  {[channelInfo.handle, channelInfo.subscribers, channelInfo.videoCount]
                    .filter(Boolean)
                    .join(" · ") || "YouTube Music artist"}
                </span>
              ) : (
                <>
                  <span>{displayedTracks.length} tracks</span>
                  {totalSec > 0 && (
                    <>
                      <span className="text-[#D1D5DB] dark:text-white/20">·</span>
                      <span>{formatTime(totalSec)}</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {displayedTracks.length > 0 && (
            <button
              onClick={() => onPlayAll(displayedTracks)}
              className="bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] text-xs font-bold px-4 py-2 rounded-full shadow-[0_6px_16px_rgba(255,208,20,0.3)] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play All</span>
            </button>
          )}
          {tab === "playlist" && activeCustomPlaylist && (
            <button
              onClick={() => onDeleteCustomPlaylist(activeCustomPlaylist.id)}
              className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-red-600 px-2.5 py-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
          {tab === "queue" && queueLength > 1 && currentTrack && (
            <button
              onClick={onClearQueue}
              className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-red-600 px-2.5 py-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </section>

      {tab === "songs" && playlists.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 shrink-0">
          {playlists.map((pl) => {
            const active = activePlaylistId === pl.id;
            return (
              <button
                key={pl.id}
                onClick={() => onSelectPlaylist(pl)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  active
                    ? "bg-[#FFD014] text-[#18181B] border-[#FFD014] shadow-sm"
                    : "bg-[#F7F8FA] dark:bg-[#161922] text-[#6B7280] dark:text-[#9CA3AF] border-black/[0.04] dark:border-white/[0.06] hover:text-[#18181B] dark:hover:text-white"
                }`}
              >
                {pl.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] gap-3 px-3 py-2 text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.06] shrink-0">
        <span>Track</span>
        <span className="hidden sm:block">Artist</span>
        <span className="hidden md:block text-right">Plays</span>
        <span className="hidden sm:block text-right">Time</span>
        <span />
      </div>

      <div className="divide-y divide-[#F3F4F6] dark:divide-white/[0.05]">
        {searching ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#6B7280] dark:text-[#9CA3AF] gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#FFD014]" />
            <p className="text-xs font-medium">Loading music from YouTube Music...</p>
          </div>
        ) : displayedTracks.length === 0 ? (
          <div className="text-center py-16 text-[#9CA3AF] dark:text-[#6B7280] text-xs">
            No tracks in this list yet.
          </div>
        ) : (
          displayedTracks.map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            const isTrackLiked = liked.some((t) => t.id === track.id);
            return (
              <div
                key={track.id}
                onClick={() => (isCurrent ? onTogglePlay() : onPlayTrack(track, displayedTracks))}
                className={`group grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  isCurrent
                    ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                    : "hover:bg-[#F7F8FA] dark:hover:bg-[#161922]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shrink-0">
                    <TrackCover src={track.thumbnail} trackId={track.id} alt={track.title} lazy />
                    <div
                      className={`absolute inset-0 bg-black/35 flex items-center justify-center transition-opacity ${
                        isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {isCurrent && isPlaying ? (
                        <Pause className="w-3.5 h-3.5 text-[#FFD014] fill-[#FFD014]" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-[#FFD014] fill-[#FFD014] ml-0.5" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-[13px] font-semibold truncate ${
                        isCurrent
                          ? "text-[#B45309] dark:text-[#FFD014]"
                          : "text-[#18181B] dark:text-[#F4F5F7]"
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="sm:hidden text-xs text-[#9CA3AF] truncate">{track.channel}</p>
                  </div>
                </div>

                <button
                  onClick={(e) => onOpenArtist(track, e)}
                  className="hidden sm:block text-xs text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate text-left cursor-pointer"
                >
                  {track.channel}
                </button>
                <p className="hidden md:block text-xs text-[#9CA3AF] dark:text-[#6B7280] text-right truncate tabular-nums">
                  {track.views || "—"}
                </p>
                <p className="hidden sm:block text-xs text-[#6B7280] dark:text-[#9CA3AF] text-right tabular-nums">
                  {track.duration}
                </p>

                <div className="flex items-center justify-end gap-0.5">
                  <button
                    onClick={(e) => onToggleLike(track, e)}
                    title="Like"
                    className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        isTrackLiked ? "fill-[#FFD014] text-[#FFD014]" : ""
                      }`}
                    />
                  </button>
                  <button
                    onClick={(e) =>
                      onOpenMenu(track, e, tab === "playlist" ? activeCustomPlaylist?.id : undefined)
                    }
                    title="More options"
                    className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
        {tab === "artists" && channelCont && (
          <div className="py-4 flex justify-center">
            <button
              onClick={onLoadMoreChannel}
              disabled={loadingMore}
              className="px-4 py-2 rounded-full border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-[#161922] hover:bg-[#F7F8FA] dark:hover:bg-[#1B1F2A] text-xs font-semibold text-[#18181B] dark:text-white flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFD014]" />}
              <span>{loadingMore ? "Loading tracks..." : "Load More"}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

