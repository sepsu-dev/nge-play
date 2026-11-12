"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Track } from "@/actions/youtube";
import { formatTime } from "@/lib/format";
import type { ClockStore } from "@/lib/playback-clock";
import {
  resolveReadyAction,
  shouldAcceptPlayerEvent,
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
  onSaveSession,
}: UseYoutubePlayerParams) {
  const playerRef = useRef<any>(null);
  const initVideoIdRef = useRef<string>("");
  const readyRef = useRef(false);
  const loadingTargetIdRef = useRef<string | null>(null);
  const seenTransitionRef = useRef(false);

  const optsRef = useRef({ isPlaying, volume, muted, repeat, shuffle });
  optsRef.current = { isPlaying, volume, muted, repeat, shuffle };

  const callbacksRef = useRef({ onAdvanceTrack, onSaveSession, setIsPlaying });
  callbacksRef.current = { onAdvanceTrack, onSaveSession, setIsPlaying };

  const loadVideo = useCallback(
    (videoId: string, startSeconds = 0, autoPlay = true) => {
      if (readyRef.current && playerRef.current?.loadVideoById) {
        loadingTargetIdRef.current = videoId;
        seenTransitionRef.current = false;
        if (autoPlay) playerRef.current.loadVideoById(videoId, Math.floor(startSeconds));
        else playerRef.current.cueVideoById?.(videoId, Math.floor(startSeconds));
      } else {
        pendingResumeRef.current = { videoId, seekTo: startSeconds, autoPlay };
      }
    },
    [pendingResumeRef]
  );

  const playVideo = useCallback(() => {
    if (readyRef.current) playerRef.current?.playVideo?.();
  }, []);

  const pauseVideo = useCallback(() => {
    if (readyRef.current) playerRef.current?.pauseVideo?.();
  }, []);

  const togglePlay = useCallback(() => {
    if (!readyRef.current || !playerRef.current) return;
    if (optsRef.current.isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, []);

  const seekTo = useCallback(
    (val: number) => {
      clock.set(val);
      if (readyRef.current && playerRef.current?.seekTo) {
        playerRef.current.seekTo(val, true);
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
    [clock]
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
      playerRef.current = new window.YT.Player("yt-audio-player", {
        height: "100%",
        width: "100%",
        videoId: trackId,
        host: "https://www.youtube-nocookie.com",
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
        },
        events: {
          onReady: (e: any) => {
            readyRef.current = true;
            const { muted: m, volume: v } = optsRef.current;
            if (m) e.target.mute();
            else e.target.setVolume(v);

            const action = resolveReadyAction(initVideoIdRef.current, pendingResumeRef.current);
            pendingResumeRef.current = null;

            if (action.type === "load") {
              loadingTargetIdRef.current = action.videoId;
              seenTransitionRef.current = false;
              e.target.loadVideoById(action.videoId, Math.floor(action.seekTo));
              callbacksRef.current.setIsPlaying(true);
              return;
            }
            if (action.type === "cue") {
              loadingTargetIdRef.current = action.videoId;
              seenTransitionRef.current = false;
              e.target.cueVideoById(action.videoId, Math.floor(action.seekTo));
              return;
            }

            clock.set(clock.getSnapshot().currentTime, e.target.getDuration?.() || 0);
            if (action.type === "resume_initial") {
              if (action.seekTo > 1) e.target.seekTo(action.seekTo, true);
              if (action.autoPlay) {
                e.target.playVideo();
                setTimeout(() => {
                  const st = e.target.getPlayerState?.();
                  if (st !== 1 && st !== 3) {
                    toast.info(`Click anywhere to resume from ${formatTime(action.seekTo)}`);
                    const unlock = () => {
                      e.target.playVideo?.();
                      window.removeEventListener("pointerdown", unlock);
                      window.removeEventListener("keydown", unlock);
                    };
                    window.addEventListener("pointerdown", unlock, { once: true });
                    window.addEventListener("keydown", unlock, { once: true });
                  }
                }, 900);
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
            if (e.data === S.PLAYING) {
              callbacksRef.current.setIsPlaying(true);
              clock.set(e.target.getCurrentTime?.() || 0, e.target.getDuration?.() || 0);
            } else if (e.data === S.PAUSED) {
              if (loadingTargetIdRef.current) return;
              callbacksRef.current.setIsPlaying(false);
              const t = e.target.getCurrentTime?.() || 0;
              clock.set(t);
              callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
            } else if (e.data === S.ENDED) {
              if (loadingTargetIdRef.current) return;
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
  }, [currentTrack?.id, activeTrackIdRef, clock, currentIndexRef, pendingResumeRef, queueRef]);


  useEffect(() => {
    const flush = () => {
      const playerVid = getPlayerVideoId(playerRef.current);
      const canReadLive =
        readyRef.current &&
        !loadingTargetIdRef.current &&
        (!playerVid || playerVid === activeTrackIdRef.current);
      const liveTime = canReadLive
        ? playerRef.current?.getCurrentTime?.() ?? clock.getSnapshot().currentTime
        : clock.getSnapshot().currentTime;
      callbacksRef.current.onSaveSession(
        { currentTime: liveTime, isPlaying: optsRef.current.isPlaying },
        true
      );
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeTrackIdRef, clock]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastMs = Date.now();
    let accSec = 0;
    let lastPosSyncMs = 0;
    let lastRawYt = -1;
    let syncYtSec = playerRef.current?.getCurrentTime?.() || 0;
    let syncPerfMs = performance.now();

    const t = setInterval(() => {
      if (!readyRef.current || !playerRef.current?.getCurrentTime) return;
      const playerVid = getPlayerVideoId(playerRef.current);
      if (!shouldAcceptPlayerEvent(playerVid, activeTrackIdRef.current, loadingTargetIdRef.current)) {
        return;
      }

      const raw = playerRef.current.getCurrentTime() || 0;
      const d = playerRef.current.getDuration?.() || 0;
      const rate = playerRef.current.getPlaybackRate?.() || 1;
      const pNow = performance.now();

      let sec: number;
      if (Math.abs(raw - lastRawYt) > 0.001) {
        lastRawYt = raw;
        syncYtSec = raw;
        syncPerfMs = pNow;
        sec = raw;
      } else {
        sec = syncYtSec + ((pNow - syncPerfMs) / 1000) * rate;
        if (Math.abs(sec - raw) > 0.35) sec = Math.min(sec, raw + 0.35);
      }
      if (d > 0) sec = Math.min(sec, d);
      const nextTime = Math.max(0, sec);
      clock.set(nextTime, d > 0 ? d : undefined);

      const now = Date.now();
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
      if (accSec >= 1.5) {
        accSec = 0;
        callbacksRef.current.onSaveSession({ currentTime: raw, isPlaying: true });
      }
    }, 80);

    return () => clearInterval(t);
  }, [isPlaying, activeTrackIdRef, clock]);

  return {
    loadVideo,
    playVideo,
    pauseVideo,
    togglePlay,
    seekTo,
    setPlayerVolume,
    setPlayerMuted,
  };
}

