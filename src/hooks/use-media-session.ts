"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Track } from "@/actions/youtube";

// Generate a 2-second 8kHz 16-bit mono WAV with +/-1 LSB (-90dB) so Chromium registers
// the top frame as an audible MediaSession owner without producing audible sound.
function createNearSilentWavUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * 2;
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

export function useMediaSession({
  currentTrack,
  isPlaying,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onSeek,
}: {
  currentTrack: Track | undefined;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
}) {
  const handlersRef = useRef({ onPlay, onPause, onPrev, onNext, onSeek });
  handlersRef.current = { onPlay, onPause, onPrev, onNext, onSeek };

  const stateRef = useRef({ currentTrack, isPlaying });
  stateRef.current = { currentTrack, isPlaying };

  const anchorRef = useRef<HTMLAudioElement | null>(null);
  const ignoreUntilRef = useRef(0);

  const applyMediaSession = useCallback(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const { currentTrack: track, isPlaying: playing } = stateRef.current;

    if (!track) {
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }

    const artworkSrc =
      track.thumbnail || (track.id ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : "");
    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: track.channel,
      album: "Nge-Play",
      artwork: artworkSrc ? [{ src: artworkSrc, sizes: "512x512" }] : [],
    });
    ms.playbackState = playing ? "playing" : "paused";

    const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {}
    };
    set("play", () => handlersRef.current.onPlay());
    set("pause", () => handlersRef.current.onPause());
    set("previoustrack", () => handlersRef.current.onPrev());
    set("nexttrack", () => handlersRef.current.onNext());
    set("seekto", (details) => {
      if (typeof details.seekTime === "number") handlersRef.current.onSeek(details.seekTime);
    });
  }, []);

  // ponytail: silent <audio> claims Chromium MediaSession over cross-origin YT iframe — replace if moving to direct <audio> playback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    if (isIos) return;

    const url = createNearSilentWavUrl();
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.01;
    audio.preload = "auto";
    (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
    anchorRef.current = audio;

    let verifyTimer: ReturnType<typeof setTimeout> | undefined;
    const onAnchorPlay = () => {
      if (performance.now() < ignoreUntilRef.current) return;
      if (!stateRef.current.isPlaying) {
        handlersRef.current.onPlay();
        clearTimeout(verifyTimer);
        verifyTimer = setTimeout(() => {
          if (!stateRef.current.isPlaying && !audio.paused) {
            ignoreUntilRef.current = performance.now() + 150;
            audio.pause();
          }
        }, 1500);
      }
    };
    const onAnchorPause = () => {
      clearTimeout(verifyTimer);
      if (performance.now() < ignoreUntilRef.current) return;
      if (stateRef.current.isPlaying) handlersRef.current.onPause();
    };
    audio.addEventListener("play", onAnchorPlay);
    audio.addEventListener("pause", onAnchorPause);

    return () => {
      clearTimeout(verifyTimer);
      audio.removeEventListener("play", onAnchorPlay);
      audio.removeEventListener("pause", onAnchorPause);
      ignoreUntilRef.current = performance.now() + 200;
      audio.pause();
      audio.src = "";
      anchorRef.current = null;
      URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const audio = anchorRef.current;
    if (audio) {
      if (isPlaying && currentTrack) {
        if (audio.paused) {
          ignoreUntilRef.current = performance.now() + 150;
          audio
            .play()
            .then(() => applyMediaSession())
            .catch(() => {});
        }
      } else if (!audio.paused) {
        ignoreUntilRef.current = performance.now() + 150;
        audio.pause();
      }
    }

    applyMediaSession();
    // Re-claim MediaSession after cross-origin YouTube iframe finishes initializing/buffering
    const t1 = setTimeout(applyMediaSession, 250);
    const t2 = setTimeout(applyMediaSession, 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [currentTrack?.id, isPlaying, applyMediaSession]);

  useEffect(() => {
    return () => {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      const ms = navigator.mediaSession;
      (["play", "pause", "previoustrack", "nexttrack", "seekto"] as MediaSessionAction[]).forEach(
        (a) => {
          try {
            ms.setActionHandler(a, null);
          } catch {}
        }
      );
    };
  }, []);
}
