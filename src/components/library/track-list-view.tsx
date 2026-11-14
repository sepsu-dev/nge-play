"use client";

import { ArrowLeft, Heart, Loader2, MoreVertical, Pause, Pencil, Play, Trash2 } from "lucide-react";
import type {
  AlbumSummary,
  ArtistSummary,
  ChannelInfo,
  YouTubePlaylist,
} from "@/actions/youtube";
import type { Track } from "@/actions/ytm-core";
import { CARD_SIZES, TrackCover } from "@/components/ui/track-cover";
import { Tip } from "@/components/ui/tooltip";
import { formatTime, parseDurationSec } from "@/lib/format";
import type { CustomPlaylist, TabId } from "@/lib/player-state";

interface TrackListViewProps {
  tab: TabId;
  searching: boolean;
  displayedTracks: Track[];
  albums?: AlbumSummary[];
  artists?: ArtistSummary[];
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
  onOpenAlbum?: (album: AlbumSummary) => void;
  onOpenArtist: (target: Track | ArtistSummary | string, e?: React.MouseEvent) => void;
  onSeeAllAlbums?: () => void;
  onSeeAllArtists?: () => void;
  onToggleLike: (track: Track, e?: React.MouseEvent) => void;
  onOpenMenu: (track: Track, e: React.MouseEvent, customPlaylistId?: string) => void;
  onSelectPlaylist: (pl: YouTubePlaylist) => void;
  onDeleteCustomPlaylist: (id: string) => void;
  onRenameCustomPlaylist: (id: string) => void;
  onClearQueue: () => void;
  onClearHistory: () => void;
  onLoadMoreChannel: () => void;
}

function TrackRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] items-center gap-3 px-3 py-2.5 animate-pulse">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3.5 w-3/5 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
          <div className="sm:hidden h-3 w-2/5 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
        </div>
      </div>
      <div className="hidden sm:block h-3 w-2/3 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
      <div className="hidden md:block h-3 w-12 ml-auto rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
      <div className="hidden sm:block h-3 w-9 ml-auto rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
      <div className="flex items-center justify-end gap-1.5">
        <div className="w-6 h-6 rounded-lg bg-[#F3F4F6] dark:bg-[#1E222D]" />
        <div className="w-6 h-6 rounded-lg bg-[#F3F4F6] dark:bg-[#1E222D]" />
      </div>
    </div>
  );
}

export function TrackListView({
  tab,
  searching,
  displayedTracks,
  albums = [],
  artists = [],
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
  onOpenAlbum,
  onOpenArtist,
  onSeeAllAlbums,
  onSeeAllArtists,
  onToggleLike,
  onOpenMenu,
  onSelectPlaylist,
  onDeleteCustomPlaylist,
  onRenameCustomPlaylist,
  onClearQueue,
  onClearHistory,
  onLoadMoreChannel,
}: TrackListViewProps) {
  const isSearchMode = tab === "songs" && !activePlaylistId;
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

  const showHeaderSkeleton =
    searching &&
    ((tab === "albums" && !activeAlbum) ||
      (tab === "artists" && !channelInfo) ||
      (tab === "songs" && !displayedTracks.length));

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3.5 min-w-0">
          {((tab === "albums" && (activeAlbum || searching)) ||
            (tab === "artists" && (channelInfo || searching)) ||
            tab === "liked" ||
            tab === "history" ||
            tab === "playlist") && (
            <Tip label="Back">
              <button
                onClick={onBack}
                aria-label="Back"
                className="p-2 rounded-full bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1E222D] text-[#18181B] dark:text-white transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Tip>
          )}
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] border border-black/[0.05] dark:border-white/[0.08] shrink-0">
            {showHeaderSkeleton ? (
              <div className="w-full h-full bg-[#EAECEF] dark:bg-[#1E222D] animate-pulse" />
            ) : (
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
            )}
          </div>
          <div className="min-w-0">
            {showHeaderSkeleton ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-5 w-44 rounded-lg bg-[#EAECEF] dark:bg-[#1E222D]" />
                <div className="h-3 w-24 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
              </div>
            ) : (
              <>
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#18181B] dark:text-white truncate">
                  {sectionTitle}
                </h1>
                <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 flex flex-wrap items-center gap-1.5 truncate">
                  {tab === "artists" && channelInfo ? (
                    <span>
                      {[channelInfo.handle, channelInfo.subscribers, channelInfo.videoCount]
                        .filter(Boolean)
                        .join(" · ") || "Artist"}
                    </span>
                  ) : searching ? (
                    <span className="inline-block h-3 w-20 rounded bg-[#EAECEF] dark:bg-[#1E222D] animate-pulse" />
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
              </>
            )}
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
              onClick={() => onRenameCustomPlaylist(activeCustomPlaylist.id)}
              className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-[#18181B] dark:hover:text-white px-2.5 py-2 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
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
          {tab === "history" && displayedTracks.length > 0 && (
            <button
              onClick={onClearHistory}
              className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-red-600 px-2.5 py-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </section>

      {tab === "songs" && (playlists.length > 0 || searching) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 shrink-0">
          {playlists.length === 0 && searching
            ? [84, 104, 92, 112, 88].map((w, i) => (
                <div
                  key={i}
                  style={{ width: `${w}px` }}
                  className="h-7 rounded-full bg-[#F7F8FA] dark:bg-[#161922] animate-pulse shrink-0"
                />
              ))
            : playlists.map((pl) => {
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

      {isSearchMode && !searching && artists.length > 0 && (
        <div className="mb-6 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#18181B] dark:text-white">Artists</h2>
            {artists.length > 4 && onSeeAllArtists && (
              <button
                onClick={onSeeAllArtists}
                className="text-xs font-semibold text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
              >
                See all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {artists.slice(0, 4).map((art) => (
              <div
                key={art.id}
                onClick={(e) => onOpenArtist(art, e)}
                className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#F1F3F6] dark:hover:bg-[#1B1F2A] border border-transparent dark:border-white/[0.05] transition-all cursor-pointer"
              >
                <div className="w-11 h-11 rounded-full overflow-hidden bg-white dark:bg-[#1E222D] shrink-0 border border-black/[0.04] dark:border-white/[0.08]">
                  <TrackCover src={art.avatar} alt={art.name} iconClass="w-4 h-4" sizes="44px" lazy />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate">
                    {art.name}
                  </p>
                  <p className="text-xs text-[#9CA3AF] truncate">
                    {art.subscribers || "Artist"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSearchMode && !searching && albums.length > 0 && (
        <div className="mb-6 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#18181B] dark:text-white">Albums</h2>
            {albums.length > 5 && onSeeAllAlbums && (
              <button
                onClick={onSeeAllAlbums}
                className="text-xs font-semibold text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
              >
                See all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
            {albums.slice(0, 5).map((alb) => (
              <div
                key={alb.id}
                onClick={() => onOpenAlbum?.(alb)}
                className="group cursor-pointer min-w-0 transition-transform duration-150 active:scale-[0.98]"
              >
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] dark:ring-1 dark:ring-white/[0.06]">
                  <TrackCover src={alb.thumbnail} alt={alb.title} iconClass="w-6 h-6" sizes={CARD_SIZES} lazy />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-9 h-9 rounded-full bg-[#FFD014] text-[#18181B] flex items-center justify-center shadow-md">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </span>
                  </div>
                </div>
                <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate mt-2">
                  {alb.title}
                </p>
                <p className="text-xs text-[#9CA3AF] truncate">{alb.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSearchMode && !searching && (artists.length > 0 || albums.length > 0) && (
        <h2 className="text-sm font-bold text-[#18181B] dark:text-white mb-2 shrink-0">Songs</h2>
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
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <TrackRowSkeleton key={i} />)
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
                  <Tip label={isTrackLiked ? "Unlike" : "Like"}>
                    <button
                      onClick={(e) => onToggleLike(track, e)}
                      aria-label={isTrackLiked ? "Unlike" : "Like"}
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          isTrackLiked ? "fill-[#FFD014] text-[#FFD014]" : ""
                        }`}
                      />
                    </button>
                  </Tip>
                  <Tip label="More options">
                    <button
                      onClick={(e) =>
                        onOpenMenu(track, e, tab === "playlist" ? activeCustomPlaylist?.id : undefined)
                      }
                      aria-label="More options"
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </Tip>
                </div>
              </div>
            );
          })
        )}
        {tab === "artists" && channelCont && (
          <>
            {loadingMore && [0, 1, 2].map((i) => <TrackRowSkeleton key={`more-${i}`} />)}
            <div className="py-4 flex justify-center">
              <button
                onClick={onLoadMoreChannel}
                disabled={loadingMore}
                className="px-4 py-2 rounded-full border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-[#161922] hover:bg-[#F7F8FA] dark:hover:bg-[#1B1F2A] text-xs font-semibold text-[#18181B] dark:text-white flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFD014]" />}
                <span>{loadingMore ? "Loading..." : "Load More"}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

