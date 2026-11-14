"use client";

import { useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import type { Track } from "@/actions/ytm-core";
import type { ClockStore } from "@/lib/playback-clock";
import {
  resolveReadyAction,
  shouldAcceptPlayerEvent,
  shouldAttemptBackgroundResume,
  shouldRestorePlayerAudio,
  type PendingResume,
} from "@/lib/player-state";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface UseYoutubePlayerParams {
  currentTrack: Track | undefined;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  volume: number;
  muted: boolean;
  repeat: boolean;
  shuffle: boolean;
  clock: ClockStore;
  activeTrackIdRef: React.MutableRefObject<string>;
  queueRef: React.MutableRefObject<Track[]>;
  currentIndexRef: React.MutableRefObject<number>;
  pendingResumeRef: React.MutableRefObject<PendingResume | null>;
  onAdvanceTrack: (index: number, list: Track[]) => void;
  onTrackEnded?: () => boolean | void;
  onPlayerPlaying?: (currentTime: number) => void;
  onSaveSession: (overrides?: { currentTime?: number; isPlaying?: boolean }, syncFlush?: boolean) => void;
}

function getPlayerVideoId(player: any): string {
  const fromData = player?.getVideoData?.()?.video_id;
  if (typeof fromData === "string" && fromData) return fromData;
  const url = player?.getVideoUrl?.();
  if (typeof url === "string") {
    const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return "";
}

export function useYoutubePlayer({
  currentTrack,
  isPlaying,
  setIsPlaying,
  volume,
  muted,
  repeat,
  shuffle,
  clock,
  activeTrackIdRef,
  queueRef,
  currentIndexRef,
  pendingResumeRef,
  onAdvanceTrack,
  onTrackEnded,
  onPlayerPlaying,
  onSaveSession,
}: UseYoutubePlayerParams) {
  const playerRef = useRef<any>(null);
  const initVideoIdRef = useRef<string>("");
  const initStartSecRef = useRef(0);
  const readyRef = useRef(false);
  const loadingTargetIdRef = useRef<string | null>(null);
  const seenTransitionRef = useRef(false);
  const hiddenAtRef = useRef(0);
  const manualPauseAtRef = useRef(0);
  const wantAutoPlayRef = useRef(false);
  const bgRetryCountRef = useRef(0);
  const bgRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgProbeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cuedRetryIdRef = useRef("");
  const cuedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optsRef = useRef({ isPlaying, volume, muted, repeat, shuffle });
  optsRef.current = { isPlaying, volume, muted, repeat, shuffle };

  const callbacksRef = useRef({
    onAdvanceTrack,
    onTrackEnded,
    onPlayerPlaying,
    onSaveSession,
    setIsPlaying,
  });
  callbacksRef.current = {
    onAdvanceTrack,
    onTrackEnded,
    onPlayerPlaying,
    onSaveSession,
    setIsPlaying,
  };

  const clearBgProbes = useCallback(() => {
    for (const id of bgProbeTimersRef.current) clearTimeout(id);
    bgProbeTimersRef.current = [];
  }, []);

  const clearBgTimers = useCallback(() => {
    if (bgRetryTimerRef.current) {
      clearTimeout(bgRetryTimerRef.current);
      bgRetryTimerRef.current = null;
    }
    if (bgGraceTimerRef.current) {
      clearTimeout(bgGraceTimerRef.current);
      bgGraceTimerRef.current = null;
    }
    if (cuedTimerRef.current) {
      clearTimeout(cuedTimerRef.current);
      cuedTimerRef.current = null;
    }
  }, []);

  const syncPlayerAudio = useCallback((player = playerRef.current) => {
    if (!player) return;
    const { muted: m, volume: v } = optsRef.current;
    if (m) {
      player.mute?.();
      return;
    }
    const targetVol = v > 0 ? v : 80;
    const curMuted = Boolean(player.isMuted?.());
    const curVol = typeof player.getVolume === "function" ? Number(player.getVolume()) : targetVol;
    if (curMuted || curVol <= 0 || curVol !== targetVol) {
      player.unMute?.();
      player.setVolume?.(targetVol);
    }
  }, []);

  const scheduleBackgroundEnsure = useCallback(() => {
    clearBgProbes();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const delay of [120, 450, 1100, 2200]) {
      timers.push(
        setTimeout(() => {
          if (typeof document === "undefined" || document.visibilityState !== "hidden") return;
          if (!readyRef.current || !playerRef.current || !wantAutoPlayRef.current) return;
          if (Date.now() - manualPauseAtRef.current < 1500) return;
          const st = playerRef.current.getPlayerState?.();
          syncPlayerAudio(playerRef.current);
          if (st !== 1 && st !== 0) {
            playerRef.current.playVideo?.();
          }
        }, delay)
      );
    }
    timers.push(
      setTimeout(() => {
        bgProbeTimersRef.current = [];
        if (typeof document === "undefined" || document.visibilityState !== "hidden") return;
        if (!readyRef.current || !playerRef.current || !wantAutoPlayRef.current) return;
        if (Date.now() - manualPauseAtRef.current < 1500) return;
        const st = playerRef.current.getPlayerState?.();
        if (st !== 1) {
          wantAutoPlayRef.current = false;
          callbacksRef.current.setIsPlaying(false);
          const t = playerRef.current.getCurrentTime?.() || 0;
          clock.set(t);
          callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
        }
      }, 3800)
    );
    bgProbeTimersRef.current = timers;
  }, [clearBgProbes, clock, syncPlayerAudio]);

  const loadVideo = useCallback(
    (videoId: string, startSeconds = 0, autoPlay = true) => {
      manualPauseAtRef.current = 0;
      wantAutoPlayRef.current = autoPlay;
      bgRetryCountRef.current = 0;
      cuedRetryIdRef.current = "";
      const isHidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      if (isHidden) hiddenAtRef.current = Date.now();
      clearBgTimers();
      clearBgProbes();
      clock.set(startSeconds, 0);
      if (readyRef.current && playerRef.current?.loadVideoById) {
        loadingTargetIdRef.current = videoId;
        seenTransitionRef.current = false;
        syncPlayerAudio(playerRef.current);
        const start = Math.max(0, Number(startSeconds.toFixed(2)));
        if (autoPlay) {
          playerRef.current.loadVideoById(videoId, start);
          if (isHidden) scheduleBackgroundEnsure();
        } else {
          playerRef.current.cueVideoById?.(videoId, start);
        }
      } else {
        pendingResumeRef.current = { videoId, seekTo: startSeconds, autoPlay };
      }
    },
    [clearBgProbes, clearBgTimers, clock, pendingResumeRef, scheduleBackgroundEnsure, syncPlayerAudio]
  );

  const playVideo = useCallback(() => {
    manualPauseAtRef.current = 0;
    wantAutoPlayRef.current = true;
    bgRetryCountRef.current = 0;
    clearBgTimers();
    clearBgProbes();
    if (readyRef.current) {
      syncPlayerAudio(playerRef.current);
      playerRef.current?.playVideo?.();
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        scheduleBackgroundEnsure();
      }
    } else if (pendingResumeRef.current) {
      pendingResumeRef.current.autoPlay = true;
    }
  }, [clearBgProbes, clearBgTimers, pendingResumeRef, scheduleBackgroundEnsure, syncPlayerAudio]);

  const pauseVideo = useCallback(() => {
    manualPauseAtRef.current = Date.now();
    wantAutoPlayRef.current = false;
    clearBgTimers();
    clearBgProbes();
    if (readyRef.current) playerRef.current?.pauseVideo?.();
    else if (pendingResumeRef.current) pendingResumeRef.current.autoPlay = false;
  }, [clearBgProbes, clearBgTimers, pendingResumeRef]);

  const togglePlay = useCallback(() => {
    if (!readyRef.current || !playerRef.current) return;
    if (optsRef.current.isPlaying) pauseVideo();
    else playVideo();
  }, [pauseVideo, playVideo]);

  const seekTo = useCallback(
    (val: number) => {
      clock.set(val);
      if (readyRef.current && playerRef.current?.seekTo) {
        const st = playerRef.current.getPlayerState?.();
        if (!optsRef.current.isPlaying && st !== 1 && st !== 2 && activeTrackIdRef.current) {
          playerRef.current.cueVideoById?.(activeTrackIdRef.current, Math.floor(val));
        } else {
          playerRef.current.seekTo(val, true);
        }
      } else if (pendingResumeRef.current) {
        pendingResumeRef.current.seekTo = val;
      }
      const dur = clock.getSnapshot().duration;
      if (dur > 0 && "mediaSession" in navigator && navigator.mediaSession.setPositionState) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: 1,
            position: Math.min(Math.max(0, val), dur),
          });
        } catch {}
      }
      callbacksRef.current.onSaveSession({ currentTime: val });
    },
    [clock, pendingResumeRef]
  );

  const setPlayerVolume = useCallback((val: number) => {
    if (readyRef.current && playerRef.current?.setVolume) {
      playerRef.current.unMute?.();
      playerRef.current.setVolume(val);
    }
  }, []);

  const setPlayerMuted = useCallback((mute: boolean, fallbackVol: number) => {
    if (!readyRef.current || !playerRef.current) return;
    if (mute) playerRef.current.mute();
    else {
      playerRef.current.unMute();
      playerRef.current.setVolume(fallbackVol || 80);
    }
  }, []);

  useEffect(() => {
    const trackId = currentTrack?.id;
    if (!trackId || playerRef.current) return;

    const resume = pendingResumeRef.current;
    const startSec = resume && resume.videoId === trackId ? Math.floor(resume.seekTo) : 0;

    const init = () => {
      if (playerRef.current || !window.YT?.Player) return;
      initVideoIdRef.current = trackId;
      initStartSecRef.current = startSec;
      playerRef.current = new window.YT.Player("yt-audio-player", {
        height: "100%",
        width: "100%",
        videoId: trackId,
        host: "https://www.youtube.com",
        playerVars: {
          autoplay: resume?.autoPlay ? 1 : 0,
          start: startSec,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (e: any) => {
            readyRef.current = true;
            e.target.getIframe?.()?.setAttribute?.("allow", "autoplay; encrypted-media; picture-in-picture");
            syncPlayerAudio(e.target);

            const action = resolveReadyAction(initVideoIdRef.current, pendingResumeRef.current);
            pendingResumeRef.current = null;

            if (action.type === "load") {
              wantAutoPlayRef.current = true;
              loadingTargetIdRef.current = action.videoId;
              seenTransitionRef.current = false;
              e.target.loadVideoById(action.videoId, Math.max(0, Number(action.seekTo.toFixed(2))));
              callbacksRef.current.setIsPlaying(true);
              return;
            }
            if (action.type === "cue") {
              wantAutoPlayRef.current = false;
              loadingTargetIdRef.current = action.videoId;
              seenTransitionRef.current = false;
              e.target.cueVideoById(action.videoId, Math.max(0, Number(action.seekTo.toFixed(2))));
              return;
            }

            clock.set(clock.getSnapshot().currentTime, e.target.getDuration?.() || 0);
            if (action.type === "resume_initial") {
              wantAutoPlayRef.current = action.autoPlay;
              if (action.autoPlay) {
                if (action.seekTo > 1) e.target.seekTo(action.seekTo, true);
                e.target.playVideo();
                setTimeout(() => {
                  const st = e.target.getPlayerState?.();
                  if (st !== 1 && st !== 3) {
                    const unlock = () => {
                      e.target.playVideo?.();
                      window.removeEventListener("pointerdown", unlock);
                      window.removeEventListener("keydown", unlock);
                    };
                    window.addEventListener("pointerdown", unlock, { once: true });
                    window.addEventListener("keydown", unlock, { once: true });
                  }
                }, 900);
              } else if (Math.floor(action.seekTo) !== initStartSecRef.current) {
                e.target.cueVideoById?.(initVideoIdRef.current, Math.floor(action.seekTo));
              }
            }
          },
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState;
            if (loadingTargetIdRef.current && (e.data === S.UNSTARTED || e.data === S.BUFFERING)) {
              seenTransitionRef.current = true;
            }
            const playerVid = getPlayerVideoId(e.target);
            if (
              !shouldAcceptPlayerEvent(
                playerVid,
                activeTrackIdRef.current,
                loadingTargetIdRef.current,
                e.data,
                seenTransitionRef.current
              )
            ) {
              return;
            }
            if (loadingTargetIdRef.current && (e.data === S.PLAYING || e.data === S.CUED)) {
              loadingTargetIdRef.current = null;
              seenTransitionRef.current = false;
            }
            if (
              e.data === S.CUED &&
              wantAutoPlayRef.current &&
              activeTrackIdRef.current &&
              cuedRetryIdRef.current !== activeTrackIdRef.current &&
              Date.now() - manualPauseAtRef.current > 1500
            ) {
              cuedRetryIdRef.current = activeTrackIdRef.current;
              if (cuedTimerRef.current) clearTimeout(cuedTimerRef.current);
              cuedTimerRef.current = setTimeout(() => {
                cuedTimerRef.current = null;
                if (wantAutoPlayRef.current && readyRef.current) {
                  syncPlayerAudio(playerRef.current);
                  playerRef.current?.playVideo?.();
                }
              }, 180);
            }
            if (e.data === S.PLAYING) {
              clearBgTimers();
              bgRetryCountRef.current = 0;
              wantAutoPlayRef.current = true;
              syncPlayerAudio(e.target);
              callbacksRef.current.setIsPlaying(true);
              const cur = e.target.getCurrentTime?.() || 0;
              clock.set(cur, e.target.getDuration?.() || 0);
              callbacksRef.current.onPlayerPlaying?.(cur);
            } else if (e.data === S.PAUSED) {
              if (loadingTargetIdRef.current) return;
              const now = Date.now();
              const isHidden =
                typeof document !== "undefined" && document.visibilityState === "hidden";
              if (isHidden && !hiddenAtRef.current) hiddenAtRef.current = now;
              // ponytail: retry playVideo on browser background pause; iOS WebKit and strict OEMs still enforce pause
              if (
                shouldAttemptBackgroundResume({
                  isHidden,
                  wasPlaying: optsRef.current.isPlaying,
                  hiddenAtMs: hiddenAtRef.current,
                  manualPauseAtMs: manualPauseAtRef.current,
                  nowMs: now,
                  retryCount: bgRetryCountRef.current,
                })
              ) {
                const attempt = bgRetryCountRef.current;
                bgRetryCountRef.current = attempt + 1;
                if (bgRetryTimerRef.current) clearTimeout(bgRetryTimerRef.current);
                bgRetryTimerRef.current = setTimeout(() => {
                  bgRetryTimerRef.current = null;
                  if (!readyRef.current || !playerRef.current || !optsRef.current.isPlaying) return;
                  if (Date.now() - manualPauseAtRef.current < 1500) return;
                  syncPlayerAudio(playerRef.current);
                  playerRef.current.playVideo?.();
                }, attempt === 0 ? 250 : 700);
                if (!bgGraceTimerRef.current) {
                  bgGraceTimerRef.current = setTimeout(() => {
                    bgGraceTimerRef.current = null;
                    if (!readyRef.current || !playerRef.current) return;
                    const st = playerRef.current.getPlayerState?.();
                    if (st === 3) {
                      syncPlayerAudio(playerRef.current);
                      playerRef.current.playVideo?.();
                      bgGraceTimerRef.current = setTimeout(() => {
                        bgGraceTimerRef.current = null;
                        if (!readyRef.current || !playerRef.current) return;
                        if (playerRef.current.getPlayerState?.() !== 1) {
                          wantAutoPlayRef.current = false;
                          callbacksRef.current.setIsPlaying(false);
                          const t = playerRef.current.getCurrentTime?.() || 0;
                          clock.set(t);
                          callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
                        }
                      }, 1800);
                      return;
                    }
                    if (st !== 1) {
                      wantAutoPlayRef.current = false;
                      callbacksRef.current.setIsPlaying(false);
                      const t = playerRef.current.getCurrentTime?.() || 0;
                      clock.set(t);
                      callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
                    }
                  }, 2200);
                }
                return;
              }
              clearBgTimers();
              wantAutoPlayRef.current = false;
              callbacksRef.current.setIsPlaying(false);
              const t = e.target.getCurrentTime?.() || 0;
              clock.set(t);
              callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
            } else if (e.data === S.ENDED) {
              if (loadingTargetIdRef.current) return;
              clearBgTimers();
              if (callbacksRef.current.onTrackEnded?.() === true) return;
              const { repeat: r, shuffle: sh } = optsRef.current;
              const q = queueRef.current;
              const i = currentIndexRef.current;
              if (r) {
                e.target.seekTo(0, true);
                e.target.playVideo();
              } else if (q.length > 0) {
                callbacksRef.current.onAdvanceTrack(
                  sh ? Math.floor(Math.random() * q.length) : (i + 1) % q.length,
                  q
                );
              }
            }
          },
          onError: () => {
            clearBgTimers();
            wantAutoPlayRef.current = false;
            loadingTargetIdRef.current = null;
            seenTransitionRef.current = false;
            callbacksRef.current.setIsPlaying(false);
            toast.error("Track cannot be played in embedded player");
          },
        },
      });
    };

    if (window.YT?.Player) init();
    else {
      window.onYouTubeIframeAPIReady = init;
      if (!document.getElementById("yt-iframe-script")) {
        const s = document.createElement("script");
        s.id = "yt-iframe-script";
        s.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(s);
      }
    }
  }, [
    currentTrack?.id,
    activeTrackIdRef,
    clearBgTimers,
    clock,
    currentIndexRef,
    pendingResumeRef,
    queueRef,
    syncPlayerAudio,
  ]);

  useEffect(() => {
    const flush = () => {
      const playerVid = getPlayerVideoId(playerRef.current);
      const st = playerRef.current?.getPlayerState?.();
      const canReadLive =
        readyRef.current &&
        !loadingTargetIdRef.current &&
        (st === 1 || st === 2) &&
        (!playerVid || playerVid === activeTrackIdRef.current);
      const liveTime = canReadLive
        ? playerRef.current?.getCurrentTime?.() ?? clock.getSnapshot().currentTime
        : clock.getSnapshot().currentTime;
      const intendedPlaying = pendingResumeRef.current
        ? pendingResumeRef.current.autoPlay
        : readyRef.current
          ? wantAutoPlayRef.current
          : optsRef.current.isPlaying;
      callbacksRef.current.onSaveSession(
        { currentTime: liveTime, isPlaying: intendedPlaying },
        true
      );
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (!hiddenAtRef.current) hiddenAtRef.current = Date.now();
        flush();
        if (optsRef.current.isPlaying || wantAutoPlayRef.current) {
          scheduleBackgroundEnsure();
        }
        return;
      }
      hiddenAtRef.current = 0;
      bgRetryCountRef.current = 0;
      clearBgTimers();
      clearBgProbes();
      if (!readyRef.current || !playerRef.current) return;
      const playerVid = getPlayerVideoId(playerRef.current);
      if (!shouldAcceptPlayerEvent(playerVid, activeTrackIdRef.current, loadingTargetIdRef.current)) {
        return;
      }
      const st = playerRef.current.getPlayerState?.();
      const t =
        st === 1 || st === 2
          ? playerRef.current.getCurrentTime?.() || 0
          : clock.getSnapshot().currentTime;
      const d = playerRef.current.getDuration?.() || 0;
      clock.set(t, d > 0 ? d : undefined);
      if (d > 0 && "mediaSession" in navigator && navigator.mediaSession.setPositionState) {
        try {
          navigator.mediaSession.setPositionState({
            duration: d,
            playbackRate: playerRef.current.getPlaybackRate?.() || 1,
            position: Math.min(Math.max(0, t), d),
          });
        } catch {}
      }
      if (st === 1) {
        syncPlayerAudio(playerRef.current);
        if (!optsRef.current.isPlaying) {
          wantAutoPlayRef.current = true;
          callbacksRef.current.setIsPlaying(true);
        }
      } else if (st === 2 && optsRef.current.isPlaying) {
        wantAutoPlayRef.current = false;
        callbacksRef.current.setIsPlaying(false);
        callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearBgTimers();
      clearBgProbes();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    activeTrackIdRef,
    clearBgProbes,
    clearBgTimers,
    clock,
    pendingResumeRef,
    scheduleBackgroundEnsure,
    syncPlayerAudio,
  ]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastMs = Date.now();
    let accSec = 0;
    let lastPosSyncMs = 0;
    let lastAudioCheckMs = 0;
    let pausedSinceMs = 0;
    let lastRawYt = -1;
    let syncYtSec = playerRef.current?.getCurrentTime?.() || 0;
    let syncPerfMs = performance.now();

    const t = setInterval(() => {
      if (!readyRef.current || !playerRef.current?.getCurrentTime) return;
      const playerVid = getPlayerVideoId(playerRef.current);
      if (!shouldAcceptPlayerEvent(playerVid, activeTrackIdRef.current, loadingTargetIdRef.current)) {
        return;
      }

      const st = playerRef.current.getPlayerState?.();
      const raw = playerRef.current.getCurrentTime() || 0;
      const d = playerRef.current.getDuration?.() || 0;
      const rate = playerRef.current.getPlaybackRate?.() || 1;
      const now = Date.now();
      const pNow = performance.now();

      if (st === 1) {
        pausedSinceMs = 0;
        if (now - lastAudioCheckMs >= 1000) {
          lastAudioCheckMs = now;
          const pMuted = Boolean(playerRef.current.isMuted?.());
          const pVol =
            typeof playerRef.current.getVolume === "function"
              ? Number(playerRef.current.getVolume())
              : optsRef.current.volume;
          if (shouldRestorePlayerAudio(pMuted, pVol, optsRef.current.muted, optsRef.current.volume)) {
            syncPlayerAudio(playerRef.current);
          }
        }
      } else if (
        st === 2 &&
        !loadingTargetIdRef.current &&
        !bgRetryTimerRef.current &&
        !bgGraceTimerRef.current
      ) {
        if (!pausedSinceMs) pausedSinceMs = now;
        else if (now - pausedSinceMs >= 1500) {
          wantAutoPlayRef.current = false;
          callbacksRef.current.setIsPlaying(false);
          clock.set(raw);
          callbacksRef.current.onSaveSession({ currentTime: raw, isPlaying: false }, true);
          return;
        }
      } else {
        pausedSinceMs = 0;
      }

      let sec: number;
      if (st !== 1 || Math.abs(raw - lastRawYt) > 0.001) {
        lastRawYt = raw;
        syncYtSec = raw;
        syncPerfMs = pNow;
        sec = raw;
      } else {
        sec = syncYtSec + ((pNow - syncPerfMs) / 1000) * rate;
        if (sec - raw > 0.25) sec = raw + 0.25;
      }
      if (d > 0) sec = Math.min(sec, d);
      const nextTime = Math.max(0, sec);
      clock.set(nextTime, d > 0 ? d : undefined);

      if (
        d > 0 &&
        now - lastPosSyncMs >= 1000 &&
        "mediaSession" in navigator &&
        navigator.mediaSession.setPositionState
      ) {
        lastPosSyncMs = now;
        try {
          navigator.mediaSession.setPositionState({
            duration: d,
            playbackRate: rate,
            position: Math.min(nextTime, d),
          });
        } catch {}
      }

      const delta = Math.min(2, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      accSec += delta;
      if (accSec >= 6) {
        accSec = 0;
        callbacksRef.current.onSaveSession({ currentTime: raw, isPlaying: true });
      }
    }, 80);

    return () => clearInterval(t);
  }, [isPlaying, activeTrackIdRef, clock, syncPlayerAudio]);

  const getPlayerState = useCallback(
    () => (readyRef.current ? (playerRef.current?.getPlayerState?.() ?? -1) : -1),
    []
  );

  return {
    loadVideo,
    playVideo,
    pauseVideo,
    togglePlay,
    seekTo,
    setPlayerVolume,
    setPlayerMuted,
    getPlayerState,
  };
}

