"use client";

import { useEffect, useState } from "react";
import { MoreVertical, Pause, Play } from "lucide-react";
import type { AlbumSummary, ArtistSummary, Track } from "@/actions/youtube";
import { TrackCover } from "@/components/ui/track-cover";
import { Tip } from "@/components/ui/tooltip";

interface HomeDashboardProps {
  loading: boolean;
  albums: AlbumSummary[];
  trending: Track[];
  recentTracks: Track[];
  artists: ArtistSummary[];
  currentTrack?: Track;
  isPlaying: boolean;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onTogglePlay: () => void;
  onOpenAlbum: (album: AlbumSummary) => void;
  onOpenArtist: (artistOrTrack: ArtistSummary | Track, e?: React.MouseEvent) => void;
  onOpenMenu: (track: Track, e: React.MouseEvent) => void;
  onSeeAllSongs: () => void;
  onSeeAllAlbums: () => void;
  onSeeAllArtists: () => void;
}

export function HomeDashboard({
  loading,
  albums,
  trending,
  recentTracks,
  artists,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onTogglePlay,
  onOpenAlbum,
  onOpenArtist,
  onOpenMenu,
  onSeeAllSongs,
  onSeeAllAlbums,
  onSeeAllArtists,
}: HomeDashboardProps) {
  const [slideIdx, setSlideIdx] = useState(0);

  const heroAlbums: AlbumSummary[] = albums.length
    ? albums.slice(0, 5)
    : recentTracks.slice(0, 5).map((t) => ({
        id: "",
        title: t.title,
        subtitle: t.channel,
        artist: t.channel,
        channelId: t.channelId,
        thumbnail: t.thumbnail,
      }));

  const safeIdx = heroAlbums.length ? slideIdx % heroAlbums.length : 0;
  const activeHero = heroAlbums[safeIdx];

  useEffect(() => {
    if (heroAlbums.length <= 1) return;
    const t = setInterval(() => {
      setSlideIdx((i) => (i + 1) % heroAlbums.length);
    }, 6500);
    return () => clearInterval(t);
  }, [heroAlbums.length]);

  const topTrending = trending.slice(0, 4);
  const topRecent = recentTracks.slice(0, 6);
  const topArtists = artists.slice(0, 4);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.32fr_1fr] gap-7 items-start">
      <section className="min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
            Albums
          </h2>
          <button
            onClick={onSeeAllAlbums}
            className="text-xs font-semibold text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
          >
            See all
          </button>
        </div>

        {loading && !activeHero ? (
          <div className="h-[224px] rounded-[24px] bg-[#F7F8FA] dark:bg-[#161922] px-6 sm:px-8 py-6 flex items-center justify-between gap-5 animate-pulse">
            <div className="flex-1 space-y-3">
              <div className="h-3 w-20 rounded bg-[#EAECEF] dark:bg-[#1E222D]" />
              <div className="h-6 w-3/4 max-w-[260px] rounded-lg bg-[#EAECEF] dark:bg-[#1E222D]" />
              <div className="h-3.5 w-1/2 max-w-[160px] rounded bg-[#EAECEF] dark:bg-[#1E222D]" />
              <div className="h-9 w-28 rounded-full bg-[#EAECEF] dark:bg-[#1E222D] mt-2" />
            </div>
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-[#EAECEF] dark:bg-[#1E222D] shrink-0" />
          </div>
        ) : activeHero ? (
          <div
            onClick={() => {
              if (activeHero.id) onOpenAlbum(activeHero);
              else if (recentTracks[safeIdx]) onPlayTrack(recentTracks[safeIdx], recentTracks);
            }}
            className="relative bg-gradient-to-br from-[#F9FAFB] via-[#F4F5F7] to-[#ECEEF2] dark:from-[#1B1F2A] dark:via-[#161922] dark:to-[#12151D] hover:brightness-[0.99] dark:hover:brightness-110 transition-all rounded-[24px] px-6 sm:px-8 py-6 min-h-[224px] flex items-center justify-between gap-5 overflow-hidden cursor-pointer group border border-black/[0.03] dark:border-white/[0.06]"
          >
            <div
              className="pointer-events-none absolute -right-8 -top-10 w-64 h-64 rounded-full opacity-20 dark:opacity-25 blur-3xl transition-opacity"
              style={{ background: "radial-gradient(circle, #FFD014 0%, transparent 70%)" }}
            />
            <div className="relative z-10 flex flex-col justify-between min-h-[172px] flex-1 min-w-0">
              <div>
                <h3 className="text-xl sm:text-[25px] font-extrabold tracking-tight text-[#18181B] dark:text-white leading-snug line-clamp-2">
                  {activeHero.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-[#8E95A2] dark:text-[#9CA3AF] mt-2 leading-relaxed line-clamp-2">
                  {activeHero.subtitle || activeHero.artist}
                </p>
              </div>

              {heroAlbums.length > 1 && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 pt-4">
                  {heroAlbums.map((item, i) => (
                    <button
                      key={item.id || item.title + i}
                      onClick={() => setSlideIdx(i)}
                      aria-label={`Slide ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        i === safeIdx
                          ? "w-5 bg-[#FFD014]"
                          : "w-1.5 bg-[#D1D5DB] dark:bg-white/20 hover:bg-[#9CA3AF] dark:hover:bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="relative z-10 w-32 h-32 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-[0_16px_32px_rgba(15,23,42,0.14)] dark:shadow-[0_18px_36px_rgba(0,0,0,0.45)] shrink-0 group-hover:scale-[1.03] transition-transform duration-300 bg-[#EAECEF] dark:bg-[#222632]">
              <TrackCover src={activeHero.thumbnail} alt={activeHero.title} iconClass="w-8 h-8" />
              <div className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-[#FFD014] text-[#18181B] flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </div>
            </div>
          </div>
        ) : null}
      </section>
      <section className="min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
            Now Trending
          </h2>
          <button
            onClick={onSeeAllSongs}
            className="text-xs font-semibold text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
          >
            See all
          </button>
        </div>

        <div className="space-y-3">
          {loading && !topTrending.length ? (
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[62px] rounded-[18px] bg-[#F7F8FA] dark:bg-[#161922] animate-pulse"
              />
            ))
          ) : (
            topTrending.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => (isCurrent ? onTogglePlay() : onPlayTrack(track, trending))}
                  className="flex items-center gap-3.5 pl-3.5 py-3 pr-3 rounded-[18px] bg-white dark:bg-[#161922] border border-black/[0.04] dark:border-white/[0.06] shadow-[0_6px_24px_rgba(15,23,42,0.035)] dark:shadow-none hover:shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:hover:bg-[#1B1F2A] transition-all cursor-pointer overflow-hidden"
                >
                  <button
                    type="button"
                    aria-label={isCurrent && isPlaying ? "Pause" : "Play"}
                    className="w-8 h-8 rounded-full bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(255,208,20,0.35)] cursor-pointer"
                  >
                    {isCurrent && isPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[13px] font-bold truncate ${
                        isCurrent
                          ? "text-[#D97706] dark:text-[#FFD014]"
                          : "text-[#18181B] dark:text-[#F4F5F7]"
                      }`}
                    >
                      {track.title}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => onOpenArtist(track, e)}
                      className="text-xs text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate block text-left cursor-pointer"
                    >
                      {track.channel}
                    </button>
                  </div>

                  <span className="text-xs font-medium text-[#4B5563] dark:text-[#9CA3AF] tabular-nums shrink-0">
                    {track.duration}
                  </span>

                  <Tip label="More options">
                    <button
                      type="button"
                      aria-label="Track options"
                      onClick={(e) => onOpenMenu(track, e)}
                      className="p-1.5 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </Tip>
                </div>
              );
            })
          )}
        </div>
      </section>
      <section className="min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
            Recently Added
          </h2>
          <button
            onClick={onSeeAllSongs}
            className="text-xs font-semibold text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
          >
            See all
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {loading && !topRecent.length ? (
            [0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2.5">
                <div className="aspect-square rounded-[18px] bg-[#F7F8FA] dark:bg-[#161922] animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-[#F7F8FA] dark:bg-[#161922] animate-pulse" />
              </div>
            ))
          ) : (
            topRecent.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => (isCurrent ? onTogglePlay() : onPlayTrack(track, recentTracks))}
                  className="group cursor-pointer min-w-0"
                >
                  <div className="relative aspect-square rounded-[18px] overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:shadow-none group-hover:shadow-[0_12px_26px_rgba(15,23,42,0.1)] dark:ring-1 dark:ring-white/[0.06] transition-all">
                    <TrackCover
                      src={track.thumbnail}
                      trackId={track.id}
                      alt={track.title}
                      iconClass="w-7 h-7"
                      lazy
                    />
                    <div
                      className={`absolute inset-0 bg-black/25 flex items-center justify-center transition-opacity ${
                        isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <span className="w-10 h-10 rounded-full bg-[#FFD014] text-[#18181B] flex items-center justify-center shadow-md">
                        {isCurrent && isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-1.5 mt-2.5">
                    <div className="min-w-0">
                      <p
                        className={`text-[13px] font-bold truncate ${
                          isCurrent
                            ? "text-[#D97706] dark:text-[#FFD014]"
                            : "text-[#18181B] dark:text-[#F4F5F7]"
                        }`}
                      >
                        {track.title}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => onOpenArtist(track, e)}
                        className="text-xs text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate block text-left cursor-pointer"
                      >
                        {track.channel}
                      </button>
                    </div>
                    <Tip label="More options">
                      <button
                        type="button"
                        aria-label="Track options"
                        onClick={(e) => onOpenMenu(track, e)}
                        className="p-1 -mr-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white rounded-lg shrink-0 cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </Tip>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
            Popular Artists
          </h2>
          <button
            onClick={onSeeAllArtists}
            className="text-xs font-semibold text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
          >
            See all
          </button>
        </div>

        <div className="space-y-3">
          {loading && !topArtists.length ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3.5 p-2 -mx-2 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3.5 w-1/2 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
                  <div className="h-3 w-1/3 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
                </div>
              </div>
            ))
          ) : (
            topArtists.map((artist) => (
              <div
                key={artist.id}
                onClick={(e) => onOpenArtist(artist, e)}
                className="flex items-center gap-3.5 p-2 -mx-2 rounded-2xl hover:bg-[#F7F8FA] dark:hover:bg-[#161922] transition-colors cursor-pointer group"
              >
                <div className="w-11 h-11 rounded-full overflow-hidden bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0 border border-black/[0.04] dark:border-white/[0.08]">
                  <TrackCover src={artist.avatar} alt={artist.name} iconClass="w-4 h-4" lazy />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate">
                    {artist.name}
                  </p>
                  <p className="text-xs text-[#9CA3AF] truncate">
                    {artist.subscribers || "Artist"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
