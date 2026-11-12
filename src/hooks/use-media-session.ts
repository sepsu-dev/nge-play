"use client";

import { useEffect, useRef } from "react";
import type { Track } from "@/actions/youtube";

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

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    if (!currentTrack) {
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }

    const artworkSrc =
      currentTrack.thumbnail ||
      (currentTrack.id ? `https://i.ytimg.com/vi/${currentTrack.id}/hqdefault.jpg` : "");
    ms.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.channel,
      album: "Nge-Play",
      artwork: artworkSrc ? [{ src: artworkSrc, sizes: "512x512" }] : [],
    });
    ms.playbackState = isPlaying ? "playing" : "paused";

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
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.channel, currentTrack?.thumbnail, isPlaying]);

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
