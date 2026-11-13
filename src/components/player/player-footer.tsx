"use client";

import {
  ChevronUp,
  Disc3,
  Headphones,
  Heart,
  Home,
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ArtistSummary, Track } from "@/actions/youtube";
import { TrackCover } from "@/components/ui/track-cover";
import { Tip } from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format";
import { usePlaybackClock, type ClockStore } from "@/lib/playback-clock";
import type { TabId } from "@/lib/player-state";

interface PlayerFooterProps {
  tab: TabId;
  loading?: boolean;
  nowPlayingOpen: boolean;
  currentTrack: Track | undefined;
  isPlaying: boolean;
  isCurrentLiked: boolean;
  repeat: boolean;
  shuffle: boolean;
  volume: number;
  muted: boolean;
  mobileVolOpen: boolean;
  clock: ClockStore;
  onSelectTab: (tab: TabId) => void;
  onToggleNowPlaying: () => void;
  onOpenArtist: (track: Track | ArtistSummary | string, e?: React.MouseEvent) => void;
  onToggleRepeat: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onSeek: (sec: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleMobileVol: () => void;
  onToggleLike: (track: Track) => void;
}

const MOBILE_NAV: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "songs", label: "Songs", icon: Headphones },
  { id: "albums", label: "Albums", icon: Disc3 },
  { id: "artists", label: "Artists", icon: Users },
  { id: "library", label: "Library", icon: ListMusic },
];

export function PlayerFooter({
  tab,
  loading = false,
  nowPlayingOpen,
  currentTrack,
  isPlaying,
  isCurrentLiked,
  repeat,
  shuffle,
  volume,
  muted,
  mobileVolOpen,
  clock,
  onSelectTab,
  onToggleNowPlaying,
  onOpenArtist,
  onToggleRepeat,
  onPrev,
  onTogglePlay,
  onNext,
  onToggleShuffle,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleMobileVol,
  onToggleLike,
}: PlayerFooterProps) {
  const { currentTime, duration } = usePlaybackClock(clock);
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volPct = muted ? 0 : volume;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.45)]">
      {!nowPlayingOpen && (
        <nav className="lg:hidden flex items-center justify-around border-t border-black/[0.04] dark:border-white/[0.06] bg-[#FAFAFB] dark:bg-[#12151D] px-2 py-1.5">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.id === "library"
                ? tab === "library" || tab === "liked" || tab === "history" || tab === "playlist"
                : tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-semibold transition-all duration-150 active:scale-95 cursor-pointer ${
                  active
                    ? "text-[#18181B] bg-[#FFF3BF] dark:bg-[#FFD014] dark:text-[#18181B]"
                    : "text-[#9CA3AF] dark:text-[#6B7280]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <footer className="relative">
        <div className="relative w-full h-[3px] hover:h-1.5 bg-[#EFEFEF] dark:bg-white/[0.08] transition-all group cursor-pointer">
          <div
            className="h-full bg-[#FFD014] transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 100}
            value={Math.min(currentTime, duration || 100)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="absolute -top-2 inset-x-0 w-full h-5 opacity-0 cursor-pointer"
          />
        </div>

        <div className="px-4 sm:px-8 py-3 flex items-center justify-between gap-3 sm:gap-5">
          <div
            onClick={() => currentTrack && onToggleNowPlaying()}
            className={`flex items-center gap-3 min-w-0 flex-1 md:max-w-[34%] ${
              currentTrack ? "cursor-pointer group/track" : ""
            }`}
          >
            {currentTrack ? (
              <>
                <TrackCover
                  src={currentTrack.thumbnail}
                  trackId={currentTrack.id}
                  alt={currentTrack.title}
                  className="w-11 h-11 rounded-xl object-cover border border-black/[0.05] dark:border-white/[0.08] shrink-0 group-hover/track:scale-[1.03] transition-transform"
                  iconClass="w-4 h-4"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#18181B] dark:text-white truncate">
                    {currentTrack.title}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenArtist(currentTrack, e);
                    }}
                    className="text-xs text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate block text-left cursor-pointer"
                  >
                    {currentTrack.channel}
                  </button>
                </div>
                <span className="hidden xl:block text-[11px] font-medium text-[#9CA3AF] tabular-nums ml-2 shrink-0">
                  {formatTime(currentTime)} - {formatTime(duration)}
                </span>
              </>
            ) : loading ? (
              <div className="flex items-center gap-3 flex-1 min-w-0 animate-pulse">
                <div className="w-11 h-11 rounded-xl bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 max-w-full rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
                  <div className="h-3 w-20 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
                <div className="w-11 h-11 rounded-xl bg-[#F4F5F7] dark:bg-[#161922] flex items-center justify-center">
                  <Music className="w-4 h-4" />
                </div>
                <span>Select a song to play</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Tip label="Repeat">
              <button
                onClick={onToggleRepeat}
                aria-label="Repeat"
                className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
                  repeat
                    ? "text-[#B45309] dark:text-[#FFD014] bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                    : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                }`}
              >
                <Repeat className="w-4 h-4" />
              </button>
            </Tip>
            <Tip label="Previous">
              <button
                onClick={onPrev}
                aria-label="Previous"
                className="inline-flex p-1.5 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors active:scale-90 cursor-pointer"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>
            </Tip>
            <Tip label={isPlaying ? "Pause" : "Play"}>
              <button
                onClick={onTogglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="w-10 h-10 rounded-full bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] flex items-center justify-center shadow-[0_6px_16px_rgba(255,208,20,0.4)] transition-transform active:scale-90 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            </Tip>
            <Tip label="Next">
              <button
                onClick={onNext}
                aria-label="Next"
                className="p-1.5 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors active:scale-90 cursor-pointer"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            </Tip>
            <Tip label="Shuffle">
              <button
                onClick={onToggleShuffle}
                aria-label="Shuffle"
                className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
                  shuffle
                    ? "text-[#B45309] dark:text-[#FFD014] bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                    : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </Tip>
          </div>

          <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 md:flex-1 md:max-w-[32%] shrink-0">
            <div onPointerDown={(e) => e.stopPropagation()} className="relative flex items-center group/vol">
              {mobileVolOpen && (
                <div className="md:hidden absolute right-0 bottom-11 bg-white dark:bg-[#161922] rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.08] px-3 py-2.5 flex items-center gap-2.5 z-50 np-pop-enter">
                  <Tip label={muted ? "Unmute" : "Mute"}>
                    <button
                      onClick={onToggleMute}
                      aria-label={muted ? "Unmute" : "Mute"}
                      className="p-1 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer shrink-0"
                    >
                      {muted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-[#B45309] dark:text-[#FFD014]" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  </Tip>
                  <div className="relative w-24 h-1.5 bg-[#EAECEF] dark:bg-white/15 rounded-full flex items-center">
                    <div className="h-full bg-[#FFD014] rounded-full" style={{ width: `${volPct}%` }} />
                    <span
                      className="w-3 h-3 rounded-full bg-[#FFD014] shadow-sm absolute -translate-x-1/2 pointer-events-none"
                      style={{ left: `${volPct}%` }}
                    />
                    <input
                      type="range"
                      aria-label="Volume"
                      min={0}
                      max={100}
                      value={volPct}
                      onChange={(e) => onVolumeChange(Number(e.target.value))}
                      className="absolute -inset-y-2 inset-x-0 w-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              <div className="hidden md:flex w-0 opacity-0 pointer-events-none overflow-hidden group-hover/vol:overflow-visible group-hover/vol:w-24 group-hover/vol:opacity-100 group-hover/vol:pointer-events-auto group-hover/vol:mr-2 group-hover/vol:px-1.5 focus-within:overflow-visible focus-within:w-24 focus-within:opacity-100 focus-within:pointer-events-auto focus-within:mr-2 focus-within:px-1.5 transition-all duration-200 items-center h-5">
                <div className="relative w-full h-1 bg-[#EAECEF] dark:bg-white/15 rounded-full flex items-center">
                  <div className="h-full bg-[#FFD014] rounded-full" style={{ width: `${volPct}%` }} />
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-[#FFD014] shadow-sm absolute -translate-x-1/2 pointer-events-none"
                    style={{ left: `${volPct}%` }}
                  />
                  <input
                    type="range"
                    aria-label="Volume"
                    min={0}
                    max={100}
                    value={volPct}
                    onChange={(e) => onVolumeChange(Number(e.target.value))}
                    className="absolute -inset-y-2 inset-x-0 w-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
              <Tip label={muted ? "Unmute" : "Volume"}>
                <button
                  onClick={() => {
                    if (window.matchMedia("(min-width: 768px)").matches) onToggleMute();
                    else onToggleMobileVol();
                  }}
                  aria-label={muted ? "Unmute" : "Volume"}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    mobileVolOpen
                      ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 text-[#B45309] dark:text-[#FFD014] md:bg-transparent md:text-[#9CA3AF]"
                      : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                  }`}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-[#B45309] dark:text-[#FFD014]" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </Tip>
            </div>

            {currentTrack && (
              <Tip label={isCurrentLiked ? "Unlike" : "Like"}>
                <button
                  onClick={() => onToggleLike(currentTrack)}
                  aria-label={isCurrentLiked ? "Unlike" : "Like"}
                  className="hidden sm:inline-flex p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors active:scale-90 cursor-pointer"
                >
                  <Heart className={`w-4 h-4 ${isCurrentLiked ? "fill-[#FFD014] text-[#FFD014]" : ""}`} />
                </button>
              </Tip>
            )}

            {currentTrack && (
              <Tip label={nowPlayingOpen ? "Close player" : "Open player"}>
                <button
                  onClick={onToggleNowPlaying}
                  aria-label={nowPlayingOpen ? "Close player" : "Open player"}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    nowPlayingOpen
                      ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 text-[#B45309] dark:text-[#FFD014]"
                      : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                  }`}
                >
                  <ChevronUp
                    className={`w-4 h-4 transition-transform duration-200 ${
                      nowPlayingOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </Tip>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

