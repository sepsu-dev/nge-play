"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Heart,
  ListPlus,
  MoreVertical,
  Pause,
  Play,
} from "lucide-react";
import type { LyricsResult } from "@/actions/lyrics";
import type { ArtistSummary } from "@/actions/youtube";
import type { Track } from "@/actions/ytm-core";
import { TrackCover } from "@/components/ui/track-cover";
import { Tip } from "@/components/ui/tooltip";
import type { ClockStore } from "@/lib/playback-clock";

interface NowPlayingModalProps {
  open: boolean;
  currentTrack: Track | undefined;
  isPlaying: boolean;
  isCurrentLiked: boolean;
  nowPlayingTab: "upnext" | "lyrics" | "related";
  queue: Track[];
  loadingQueue?: boolean;
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
  onSaveToPlaylist: (track: Track, e: React.MouseEvent) => void;
  onPlayTrackAt: (index: number, list: Track[]) => void;
  onPlayTrackNow: (track: Track, list: Track[]) => void;
  onSeek: (sec: number) => void;
}

const LYRIC_LEAD_SEC = 0.1;

function findActiveLyricIndex(lines: { time: number }[], targetTime: number): number {
  let low = 0;
  let high = lines.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= targetTime) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
}

function useActiveLyricIndex(
  clock: ClockStore,
  lines: { time: number }[] | undefined,
  enabled: boolean
): number {
  const [activeIdx, setActiveIdx] = useState(-1);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    if (!enabled || !lines || lines.length === 0) {
      setActiveIdx(-1);
      return;
    }

    const check = () => {
      const curLines = linesRef.current;
      if (!curLines || curLines.length === 0) return;
      const t = clock.getSnapshot().currentTime + LYRIC_LEAD_SEC;
      const next = findActiveLyricIndex(curLines, t);
      setActiveIdx((prev) => (prev === next ? prev : next));
    };

    check();
    return clock.subscribe(check);
  }, [clock, enabled, lines]);

  return activeIdx;
}

function MiniTrackSkeletonList() {
  return (
    <div className="space-y-1.5 animate-pulse">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2.5 rounded-2xl">
          <div className="w-11 h-11 rounded-xl bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3.5 w-3/5 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
            <div className="h-3 w-2/5 rounded bg-[#F3F4F6] dark:bg-[#1E222D]" />
          </div>
          <div className="h-3 w-9 rounded bg-[#F3F4F6] dark:bg-[#1E222D] shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function NowPlayingModal({
  open,
  currentTrack,
  isPlaying,
  isCurrentLiked,
  nowPlayingTab,
  queue,
  loadingQueue = false,
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
  onSaveToPlaylist,
  onPlayTrackAt,
  onPlayTrackNow,
  onSeek,
}: NowPlayingModalProps) {
  const [showMiniHeader, setShowMiniHeader] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const lyricsModalBoxRef = useRef<HTMLDivElement | null>(null);
  const activeModalLyricRef = useRef<HTMLButtonElement | null>(null);
  const manualPauseUntilRef = useRef(0);

  const activeLyrics = lyrics?.variants?.[lyricVariantIdx] || lyrics;
  const activeLyricIndex = useActiveLyricIndex(
    clock,
    activeLyrics?.synced,
    open && nowPlayingTab === "lyrics"
  );

  useEffect(() => {
    setShowMiniHeader(false);
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [open, currentTrack?.id]);

  useEffect(() => {
    const root = mainScrollRef.current;
    const target = heroRef.current;
    if (!open || !root || !target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (window.innerWidth >= 1024) {
          setShowMiniHeader(false);
          return;
        }
        setShowMiniHeader(!entry.isIntersecting);
      },
      { root, threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, currentTrack?.id]);

  useEffect(() => {
    const el = activeModalLyricRef.current;
    if (!open || nowPlayingTab !== "lyrics" || !el) return;

    if (window.innerWidth >= 1024) {
      const box = lyricsModalBoxRef.current;
      if (box) {
        box.scrollTo({
          top: Math.max(0, el.offsetTop - box.clientHeight * 0.38),
          behavior: "smooth",
        });
      }
      return;
    }

    if (Date.now() < manualPauseUntilRef.current) return;
    const container = mainScrollRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const target = container.scrollTop + (eRect.top - cRect.top) - container.clientHeight * 0.45;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeLyricIndex, open, nowPlayingTab]);

  const pauseAutoScroll = () => {
    manualPauseUntilRef.current = Date.now() + 3500;
  };

  const scrollToHero = () => {
    manualPauseUntilRef.current = Date.now() + 3500;
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      <div className="flex items-center justify-between gap-3 px-5 sm:px-10 py-3 sm:py-4 border-b border-black/[0.04] dark:border-white/[0.06] shrink-0">
        <div className="relative flex-1 min-w-0 h-9 flex items-center">
          <span
            className={`text-xs font-bold tracking-wide text-[#9CA3AF] transition-all duration-200 ${
              showMiniHeader
                ? "opacity-0 -translate-y-1 pointer-events-none lg:opacity-100 lg:translate-y-0"
                : "opacity-100 translate-y-0"
            }`}
          >
            Now Playing
          </span>
          <div
            className={`lg:hidden absolute inset-0 flex items-center gap-2.5 transition-all duration-200 ${
              showMiniHeader
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-1 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={scrollToHero}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] border border-black/[0.04] dark:border-white/[0.08] shrink-0">
                <TrackCover
                  src={currentTrack.thumbnail}
                  trackId={currentTrack.id}
                  alt={currentTrack.title}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#18181B] dark:text-white truncate">
                  {currentTrack.title}
                </p>
                <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] truncate">
                  {currentTrack.channel}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onToggleLike(currentTrack)}
              aria-label={isCurrentLiked ? "Unlike" : "Like"}
              className={`p-1.5 rounded-full border transition-all active:scale-95 cursor-pointer shrink-0 ${
                isCurrentLiked
                  ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 border-[#FFD014] text-[#B45309] dark:text-[#FFD014]"
                  : "bg-[#F7F8FA] dark:bg-[#161922] border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF]"
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${isCurrentLiked ? "fill-[#FFD014] text-[#FFD014]" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={(e) => onSaveToPlaylist(currentTrack, e)}
              aria-label="Save to playlist"
              className="p-1.5 rounded-full bg-[#F7F8FA] dark:bg-[#161922] border border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <ListPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <Tip label="Minimize player" side="bottom">
          <button
            onClick={onClose}
            aria-label="Minimize player"
            className="p-2 rounded-full bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#FFF9DB] dark:hover:bg-[#1E222D] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors active:scale-95 cursor-pointer shrink-0"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </Tip>
      </div>

      <div
        ref={mainScrollRef}
        onTouchStart={pauseAutoScroll}
        onWheel={pauseAutoScroll}
        className="w-full max-w-6xl mx-auto flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-5 lg:gap-12 px-5 sm:px-10 lg:py-6 overflow-y-auto lg:overflow-hidden overscroll-contain"
      >
        <div
          ref={heroRef}
          className="flex flex-col items-center justify-center text-center pt-5 lg:py-4 shrink-0"
        >
          <div className="w-48 h-48 sm:w-64 sm:h-64 lg:w-full lg:max-w-[380px] aspect-square rounded-[24px] lg:rounded-[28px] overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55)] border border-black/[0.04] dark:border-white/[0.08] transition-transform duration-300">
            <TrackCover
              src={currentTrack.thumbnail}
              trackId={currentTrack.id}
              alt={currentTrack.title}
              iconClass="w-12 h-12"
              sizes="(min-width: 1024px) 380px, 70vw"
            />
          </div>
          <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[#18181B] dark:text-white mt-4 lg:mt-5 max-w-md line-clamp-2">
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
          <div className="flex items-center gap-2.5 mt-3.5 lg:mt-4">
            <button
              onClick={() => onToggleLike(currentTrack)}
              className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all active:scale-95 cursor-pointer ${
                isCurrentLiked
                  ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 border-[#FFD014] text-[#B45309] dark:text-[#FFD014]"
                  : "bg-[#F7F8FA] dark:bg-[#161922] border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${isCurrentLiked ? "fill-[#FFD014] text-[#FFD014]" : ""}`}
              />
              <span>{isCurrentLiked ? "Liked" : "Like"}</span>
            </button>
            <button
              type="button"
              onClick={(e) => onSaveToPlaylist(currentTrack, e)}
              className="px-4 py-2 rounded-full text-xs font-semibold bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1E222D] border border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:min-h-0">
          <div className="sticky top-0 lg:static z-10 -mx-5 px-5 pt-2 sm:-mx-10 sm:px-10 lg:mx-0 lg:px-0 lg:pt-0 bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-md lg:bg-transparent lg:dark:bg-transparent lg:backdrop-blur-none flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
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
            {nowPlayingTab === "lyrics" && lyrics?.variants && lyrics.variants.length > 1 ? (
              <div className="mb-2 flex items-center gap-1 shrink-0">
                <Tip label="Switch lyric timing version">
                  <button
                    type="button"
                    onClick={onCycleLyricVariant}
                    className="px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#161922] text-[#B45309] dark:text-[#FFD014] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 text-[11px] font-semibold cursor-pointer tabular-nums"
                  >
                    v{lyricVariantIdx + 1}/{lyrics.variants.length}
                  </button>
                </Tip>
              </div>
            ) : null}
          </div>

          {nowPlayingTab === "upnext" ? (
            <div
              key="upnext"
              className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pt-3 pb-6 lg:pb-0 space-y-1 pr-1 np-tab-enter"
            >
              {loadingQueue && queue.length === 0 ? (
                <MiniTrackSkeletonList />
              ) : queue.length === 0 ? (
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
                      <Tip label="More options">
                        <button
                          onClick={(e) => onOpenMenu(item, e)}
                          aria-label="More options"
                          className="p-1.5 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white rounded-lg cursor-pointer shrink-0"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </Tip>
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
              className="notranslate relative lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden py-5 pb-8 lg:pb-5 space-y-1.5 pr-1 np-tab-enter"
            >
              {loadingLyrics ? (
                <div className="space-y-3 py-4 px-3.5 animate-pulse">
                  {[
                    "w-2/5 h-3 mb-2",
                    "w-3/4 h-5",
                    "w-4/5 h-5",
                    "w-2/3 h-5",
                    "w-5/6 h-5",
                    "w-1/2 h-5",
                    "w-3/4 h-5",
                    "w-2/3 h-5",
                  ].map((cls, i) => (
                    <div
                      key={i}
                      className={`${cls} rounded-lg bg-[#F3F4F6] dark:bg-[#1E222D]`}
                    />
                  ))}
                </div>
              ) : activeLyrics?.synced.length ? (
                <>
                  {activeLyrics.trackName && (
                    <p className="px-3.5 pb-1 text-[11px] text-[#9CA3AF] truncate">
                      {activeLyrics.artistName
                        ? `${activeLyrics.artistName} — ${activeLyrics.trackName}`
                        : activeLyrics.trackName}
                    </p>
                  )}
                  {activeLyrics.synced.map((line, i) => {
                    const active = i === activeLyricIndex;
                    const past = activeLyricIndex !== -1 && i < activeLyricIndex;
                    return (
                      <button
                        key={`modal-${line.time}-${i}`}
                        ref={active ? activeModalLyricRef : null}
                        onClick={() => onSeek(line.time)}
                        className={`w-full text-left text-[13px] sm:text-[15px] leading-snug font-semibold px-3 py-1.5 rounded-2xl flex items-center gap-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
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
                              ? `h-4 bg-[#FFD014] ${isPlaying ? "animate-pulse" : ""}`
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
                  })}
                </>
              ) : activeLyrics?.plain ? (
                <pre className="text-xs sm:text-sm text-[#374151] dark:text-[#D1D5DB] whitespace-pre-wrap font-sans leading-relaxed">
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
              className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pt-3 pb-6 lg:pb-0 space-y-1 pr-1 np-tab-enter"
            >
              {loadingRelated ? (
                <MiniTrackSkeletonList />
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
                      <Tip label="More options">
                        <button
                          onClick={(e) => onOpenMenu(item, e)}
                          aria-label="More options"
                          className="p-1.5 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white rounded-lg cursor-pointer shrink-0"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </Tip>
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


