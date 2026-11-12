"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Track } from "@/actions/youtube";
import { formatTime } from "@/lib/format";
import type { ClockStore } from "@/lib/playback-clock";
import type { PendingResume } from "@/lib/player-state";

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

function streamUrl(videoId: string) {
  return `/api/stream?id=${encodeURIComponent(videoId)}`;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedTrackIdRef = useRef<string>("");
  const pendingSeekRef = useRef<number | null>(null);
  const switchingRef = useRef(false);

  const optsRef = useRef({ isPlaying, volume, muted, repeat, shuffle });
  optsRef.current = { isPlaying, volume, muted, repeat, shuffle };

  const callbacksRef = useRef({ onAdvanceTrack, onSaveSession, setIsPlaying });
  callbacksRef.current = { onAdvanceTrack, onSaveSession, setIsPlaying };

  const attemptPlay = useCallback((audio: HTMLAudioElement, resumeHintSec?: number) => {
    audio
      .play()
      .then(() => {
        callbacksRef.current.setIsPlaying(true);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        callbacksRef.current.setIsPlaying(false);
        if (err?.name === "NotAllowedError" && resumeHintSec !== undefined) {
          const label =
            resumeHintSec > 1
              ? `Click anywhere to resume from ${formatTime(resumeHintSec)}`
              : "Tap anywhere to resume playback";
          toast.info(label);
          const unlock = () => {
            audio.play().catch(() => {});
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
          };
          window.addEventListener("pointerdown", unlock, { once: true });
          window.addEventListener("keydown", unlock, { once: true });
        }
      });
  }, []);

  const loadVideo = useCallback(
    (videoId: string, startSeconds = 0, autoPlay = true, resumeHintSec?: number) => {
      const audio = audioRef.current;
      if (!audio) {
        pendingResumeRef.current = { videoId, seekTo: startSeconds, autoPlay };
        return;
      }
      switchingRef.current = true;
      loadedTrackIdRef.current = videoId;
      pendingSeekRef.current = startSeconds > 0 ? startSeconds : null;
      if (pendingResumeRef.current && pendingResumeRef.current.videoId !== videoId) {
        pendingResumeRef.current = null;
      }

      audio.pause();
      audio.src = streamUrl(videoId);
      audio.load();

      if (autoPlay) attemptPlay(audio, resumeHintSec);
      else callbacksRef.current.setIsPlaying(false);
    },
    [attemptPlay, pendingResumeRef]
  );

  const playVideo = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!loadedTrackIdRef.current && activeTrackIdRef.current) {
      loadVideo(activeTrackIdRef.current, clock.getSnapshot().currentTime, true);
      return;
    }
    if (loadedTrackIdRef.current) attemptPlay(audio);
  }, [activeTrackIdRef, attemptPlay, clock, loadVideo]);

  const pauseVideo = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!loadedTrackIdRef.current && activeTrackIdRef.current) {
      loadVideo(activeTrackIdRef.current, clock.getSnapshot().currentTime, true);
      return;
    }
    if (optsRef.current.isPlaying) audio.pause();
    else attemptPlay(audio);
  }, [activeTrackIdRef, attemptPlay, clock, loadVideo]);

  const seekTo = useCallback(
    (val: number) => {
      const audio = audioRef.current;
      const safeVal = Math.max(0, val);
      clock.set(safeVal);
      if (audio) {
        if (audio.readyState >= 1) {
          audio.currentTime = safeVal;
          pendingSeekRef.current = null;
        } else {
          pendingSeekRef.current = safeVal;
        }
      }
      const dur = clock.getSnapshot().duration;
      if (dur > 0 && "mediaSession" in navigator && navigator.mediaSession.setPositionState) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: audio?.playbackRate || 1,
            position: Math.min(safeVal, dur),
          });
        } catch {}
      }
      callbacksRef.current.onSaveSession({ currentTime: safeVal });
    },
    [clock]
  );

  const setPlayerVolume = useCallback((val: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0, val / 100));
  }, []);

  const setPlayerMuted = useCallback((mute: boolean, fallbackVol: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = mute;
    if (!mute) audio.volume = Math.min(1, Math.max(0, (fallbackVol || 80) / 100));
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = Math.min(1, Math.max(0, optsRef.current.volume / 100));
    audio.muted = optsRef.current.muted;
    audioRef.current = audio;

    const syncDuration = () => {
      if (loadedTrackIdRef.current !== activeTrackIdRef.current) return;
      if (pendingResumeRef.current?.videoId === loadedTrackIdRef.current) {
        pendingResumeRef.current = null;
      }
      if (pendingSeekRef.current !== null && audio.readyState >= 1) {
        const target = pendingSeekRef.current;
        pendingSeekRef.current = null;
        audio.currentTime = target;
      }
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      clock.set(audio.currentTime || 0, d);
    };

    const onPlay = () => {
      if (loadedTrackIdRef.current !== activeTrackIdRef.current) return;
      switchingRef.current = false;
      callbacksRef.current.setIsPlaying(true);
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      clock.set(audio.currentTime || 0, d);
    };

    const onPause = () => {
      if (switchingRef.current || audio.ended) return;
      if (loadedTrackIdRef.current !== activeTrackIdRef.current) return;
      callbacksRef.current.setIsPlaying(false);
      const t = audio.currentTime || 0;
      clock.set(t);
      callbacksRef.current.onSaveSession({ currentTime: t, isPlaying: false }, true);
    };

    const onEnded = () => {
      if (loadedTrackIdRef.current !== activeTrackIdRef.current) return;
      const { repeat: r, shuffle: sh } = optsRef.current;
      const q = queueRef.current;
      const i = currentIndexRef.current;
      if (r) {
        audio.currentTime = 0;
        attemptPlay(audio);
      } else if (q.length > 0) {
        callbacksRef.current.onAdvanceTrack(
          sh ? Math.floor(Math.random() * q.length) : (i + 1) % q.length,
          q
        );
      } else {
        callbacksRef.current.setIsPlaying(false);
      }
    };

    const onError = () => {
      if (!audio.getAttribute("src") || loadedTrackIdRef.current !== activeTrackIdRef.current) return;
      switchingRef.current = false;
      callbacksRef.current.setIsPlaying(false);
      toast.error("Failed to stream audio for this track");
    };

    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("playing", onPlay);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("playing", onPlay);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      loadedTrackIdRef.current = "";
    };
  }, [activeTrackIdRef, attemptPlay, clock, currentIndexRef, pendingResumeRef, queueRef]);

  useEffect(() => {
    const trackId = currentTrack?.id;
    if (!trackId) return;

    const pending = pendingResumeRef.current;
    if (pending && pending.videoId === trackId) {
      loadVideo(
        pending.videoId,
        pending.seekTo,
        pending.autoPlay,
        pending.autoPlay ? pending.seekTo : undefined
      );
      return;
    }
    if (pending) pendingResumeRef.current = null;

    if (loadedTrackIdRef.current !== trackId) {
      loadVideo(trackId, 0, optsRef.current.isPlaying);
    }
  }, [currentTrack?.id, loadVideo, pendingResumeRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume / 100));
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const flush = () => {
      const audio = audioRef.current;
      const canReadLive =
        Boolean(audio) &&
        loadedTrackIdRef.current === activeTrackIdRef.current &&
        pendingSeekRef.current === null;
      const liveTime = canReadLive
        ? audio?.currentTime ?? clock.getSnapshot().currentTime
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

    const t = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || loadedTrackIdRef.current !== activeTrackIdRef.current) return;

      const raw = audio.currentTime || 0;
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const rate = audio.playbackRate || 1;
      clock.set(raw, d > 0 ? d : undefined);

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
            position: Math.min(raw, d),
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

