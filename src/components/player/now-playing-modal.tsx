"use client";

import { useEffect, useRef } from "react";
import {
  ChevronDown,
  Heart,
  ListPlus,
  Loader2,
  MoreVertical,
  Pause,
  Play,
} from "lucide-react";
import type { ArtistSummary, LyricsResult, Track } from "@/actions/youtube";
import { TrackCover } from "@/components/library/track-cover";
import { usePlaybackClock, type ClockStore } from "@/lib/playback-clock";

interface NowPlayingModalProps {
  open: boolean;
  currentTrack: Track | undefined;
  isPlaying: boolean;
  isCurrentLiked: boolean;
  nowPlayingTab: "upnext" | "lyrics" | "related";
  queue: Track[];
  currentIndex: number;
  lyrics: LyricsResult | null;
  loadingLyrics: boolean;
  lyricVariantIdx: number;
  relatedTracks: Track[];
  loadingRelated: boolean;
  clock: ClockStore;
  onClose: () => void;
  onTabChange: (tab: "upnext" | "lyrics" | "related") => void;
  onCycleLyricVariant: () => void;
  onOpenArtist: (track: Track | ArtistSummary | string, e?: React.MouseEvent) => void;
  onToggleLike: (track: Track) => void;
  onOpenMenu: (track: Track, e: React.MouseEvent) => void;
  onPlayTrackAt: (index: number, list: Track[]) => void;
  onPlayTrackNow: (track: Track, list: Track[]) => void;
  onSeek: (sec: number) => void;
}

const LYRIC_LEAD_SEC = 0.45;

export function NowPlayingModal({
  open,
  currentTrack,
  isPlaying,
  isCurrentLiked,
  nowPlayingTab,
  queue,
  currentIndex,
  lyrics,
  loadingLyrics,
  lyricVariantIdx,
  relatedTracks,
  loadingRelated,
  clock,
  onClose,
  onTabChange,
  onCycleLyricVariant,
  onOpenArtist,
  onToggleLike,
  onOpenMenu,
  onPlayTrackAt,
  onPlayTrackNow,
  onSeek,
}: NowPlayingModalProps) {
  const { currentTime } = usePlaybackClock(clock);
  const lyricsModalBoxRef = useRef<HTMLDivElement | null>(null);
  const activeModalLyricRef = useRef<HTMLButtonElement | null>(null);

  const activeLyrics = lyrics?.variants?.[lyricVariantIdx] || lyrics;
  const activeLyricIndex = activeLyrics?.synced.length
    ? activeLyrics.synced.reduce(
        (acc, line, idx) => (line.time <= currentTime + LYRIC_LEAD_SEC ? idx : acc),
        -1
      )
    : -1;

  useEffect(() => {
    const box = lyricsModalBoxRef.current;
    const el = activeModalLyricRef.current;
    if (open && nowPlayingTab === "lyrics" && box && el) {
      box.scrollTo({
        top: Math.max(0, el.offsetTop - box.clientHeight * 0.38),
        behavior: "smooth",
      });
    }
  }, [activeLyricIndex, open, nowPlayingTab]);

  if (!currentTrack) return null;

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-30 bg-white dark:bg-[#0D0F14] flex flex-col pb-[72px] transition-[opacity,transform,visibility] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? "opacity-100 translate-y-0 visible pointer-events-auto"
          : "opacity-0 translate-y-8 invisible pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-between px-5 sm:px-10 py-4 border-b border-black/[0.04] dark:border-white/[0.06] shrink-0">
        <span className="text-xs font-bold tracking-wide text-[#9CA3AF]">Now Playing</span>
        <button
          onClick={onClose}
          title="Minimize player"
          className="p-2 rounded-full bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#FFF9DB] dark:hover:bg-[#1E222D] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors active:scale-95 cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 lg:gap-12 px-5 sm:px-10 py-6 overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col items-center justify-center text-center lg:py-4 shrink-0">
          <div className="w-52 h-52 sm:w-72 sm:h-72 lg:w-full lg:max-w-[380px] aspect-square rounded-[28px] overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55)] border border-black/[0.04] dark:border-white/[0.08] transition-transform duration-300">
            <TrackCover
              src={currentTrack.thumbnail}
              trackId={currentTrack.id}
              alt={currentTrack.title}
              iconClass="w-12 h-12"
            />
          </div>
          <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[#18181B] dark:text-white mt-5 max-w-md line-clamp-2">
            {currentTrack.title}
          </h2>
          <button
            onClick={(e) => {
              onOpenArtist(currentTrack, e);
              onClose();
            }}
            className="text-sm font-medium text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white mt-1 cursor-pointer"
          >
            {currentTrack.channel}
          </button>
          <div className="flex items-center gap-2.5 mt-4">
            <button
              onClick={() => onToggleLike(currentTrack)}
              className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all active:scale-95 cursor-pointer ${
                isCurrentLiked
                  ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 border-[#FFD014] text-[#B45309] dark:text-[#FFD014]"
                  : "bg-[#F7F8FA] dark:bg-[#161922] border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isCurrentLiked ? "fill-[#FFD014] text-[#FFD014]" : ""}`} />
              <span>{isCurrentLiked ? "Liked" : "Like"}</span>
            </button>
            <button
              onClick={(e) => onOpenMenu(currentTrack, e)}
              className="px-4 py-2 rounded-full text-xs font-semibold bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1E222D] border border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col min-h-[320px] lg:min-h-0">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
            <div className="flex items-center gap-6">
              {[
                { id: "upnext", label: "Up Next" },
                { id: "lyrics", label: "Lyrics" },
                { id: "related", label: "Related" },
              ].map((t) => {
                const active = nowPlayingTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTabChange(t.id as "upnext" | "lyrics" | "related")}
                    className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                      active
                        ? "border-[#FFD014] text-[#18181B] dark:text-white"
                        : "border-transparent text-[#9CA3AF] dark:text-[#6B7280] hover:text-[#18181B] dark:hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            {nowPlayingTab === "lyrics" &&
            activeLyrics?.synced.length &&
            lyrics?.variants &&
            lyrics.variants.length > 1 ? (
              <button
                onClick={onCycleLyricVariant}
                title="Switch lyric timing version"
                className="mb-2 px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#161922] text-[#B45309] dark:text-[#FFD014] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 text-[11px] font-semibold cursor-pointer tabular-nums"
              >
                v{lyricVariantIdx + 1}/{lyrics.variants.length}
              </button>
            ) : null}
          </div>

          {nowPlayingTab === "upnext" ? (
            <div
              key="upnext"
              className="flex-1 min-h-0 overflow-y-auto pt-3 space-y-1 pr-1 np-tab-enter"
            >
              {queue.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-16">Queue is empty.</p>
              ) : (
                queue.map((item, idx) => {
                  const isCur = idx === currentIndex;
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      onClick={() => onPlayTrackAt(idx, queue)}
                      className={`group flex items-center gap-3 p-2.5 rounded-2xl transition-colors cursor-pointer ${
                        isCur
                          ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                          : "hover:bg-[#F7F8FA] dark:hover:bg-[#161922]"
                      }`}
                    >
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shrink-0">
                        <TrackCover src={item.thumbnail} trackId={item.id} alt={item.title} lazy />
                        <div
                          className={`absolute inset-0 bg-black/35 flex items-center justify-center transition-opacity ${
                            isCur ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {isCur && isPlaying ? (
                            <Pause className="w-3.5 h-3.5 text-[#FFD014] fill-[#FFD014]" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-[#FFD014] fill-[#FFD014] ml-0.5" />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[13px] font-semibold truncate ${
                            isCur
                              ? "text-[#B45309] dark:text-[#FFD014]"
                              : "text-[#18181B] dark:text-[#F4F5F7]"
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-xs text-[#9CA3AF] truncate">{item.channel}</p>
                      </div>
                      <span className="text-xs text-[#9CA3AF] tabular-nums shrink-0">
                        {item.duration}
                      </span>
                      <button
                        onClick={(e) => onOpenMenu(item, e)}
                        title="More options"
                        className="p-1.5 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white rounded-lg cursor-pointer shrink-0"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : nowPlayingTab === "lyrics" ? (
            <div
              key="lyrics"
              ref={lyricsModalBoxRef}
              translate="no"
              className="notranslate relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-5 space-y-1.5 pr-1 np-tab-enter"
            >
              {loadingLyrics ? (
                <div className="flex items-center gap-2 text-sm text-[#6B7280] dark:text-[#9CA3AF] py-20 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFD014]" />
                  <span>Finding lyrics...</span>
                </div>
              ) : activeLyrics?.synced.length ? (
                activeLyrics.synced.map((line, i) => {
                  const active = i === activeLyricIndex;
                  const past = activeLyricIndex !== -1 && i < activeLyricIndex;
                  return (
                    <button
                      key={`modal-${line.time}-${i}`}
                      ref={active ? activeModalLyricRef : null}
                      onClick={() => onSeek(Math.max(0, line.time))}
                      className={`w-full text-left text-[15px] sm:text-lg leading-snug font-semibold px-3.5 py-2 rounded-2xl flex items-center gap-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                        active
                          ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 text-[#18181B] dark:text-[#FFD014] shadow-[0_6px_20px_rgba(255,208,20,0.16)] dark:shadow-none"
                          : past
                          ? "text-[#9CA3AF] dark:text-[#6B7280] opacity-40 blur-[0.3px] hover:opacity-85 hover:blur-none"
                          : "text-[#374151] dark:text-[#D1D5DB] opacity-70 hover:opacity-100"
                      }`}
                    >
                      <span
                        className={`w-1 rounded-full transition-all duration-300 shrink-0 ${
                          active
                            ? `h-5 bg-[#FFD014] ${isPlaying ? "animate-pulse" : ""}`
                            : "h-1.5 bg-transparent"
                        }`}
                      />
                      <span
                        className={`flex-1 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-left ${
                          active ? "translate-x-1 scale-[1.02]" : ""
                        }`}
                      >
                        {line.text}
                      </span>
                    </button>
                  );
                })
              ) : activeLyrics?.plain ? (
                <pre className="text-sm sm:text-base text-[#374151] dark:text-[#D1D5DB] whitespace-pre-wrap font-sans leading-relaxed">
                  {activeLyrics.plain}
                </pre>
              ) : (
                <p className="text-sm text-[#9CA3AF] text-center py-20">
                  Lyrics unavailable for this track.
                </p>
              )}
            </div>
          ) : (
            <div
              key="related"
              className="flex-1 min-h-0 overflow-y-auto pt-3 space-y-1 pr-1 np-tab-enter"
            >
              {loadingRelated ? (
                <div className="flex items-center gap-2 text-sm text-[#6B7280] dark:text-[#9CA3AF] py-20 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFD014]" />
                  <span>Loading related songs...</span>
                </div>
              ) : relatedTracks.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-16">
                  No related songs found.
                </p>
              ) : (
                relatedTracks.map((item) => {
                  const isCur = currentTrack?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onPlayTrackNow(item, relatedTracks)}
                      className={`group flex items-center gap-3 p-2.5 rounded-2xl transition-colors cursor-pointer ${
                        isCur
                          ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                          : "hover:bg-[#F7F8FA] dark:hover:bg-[#161922]"
                      }`}
                    >
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shrink-0">
                        <TrackCover src={item.thumbnail} trackId={item.id} alt={item.title} lazy />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[13px] font-semibold truncate ${
                            isCur
                              ? "text-[#B45309] dark:text-[#FFD014]"
                              : "text-[#18181B] dark:text-[#F4F5F7]"
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-xs text-[#9CA3AF] truncate">{item.channel}</p>
                      </div>
                      <span className="text-xs text-[#9CA3AF] tabular-nums shrink-0">
                        {item.duration}
                      </span>
                      <button
                        onClick={(e) => onOpenMenu(item, e)}
                        title="More options"
                        className="p-1.5 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white rounded-lg cursor-pointer shrink-0"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


