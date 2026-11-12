import type { Track } from "@/actions/youtube";

export interface CustomPlaylist {
  id: string;
  name: string;
  tracks: Track[];
}

export interface TrackMenuState {
  track: Track;
  x: number;
  y: number;
  customPlaylistId?: string;
  playlistOnly?: boolean;
}

export type TabId =
  | "home"
  | "songs"
  | "albums"
  | "artists"
  | "liked"
  | "history"
  | "queue"
  | "playlist"
  | "library";

export interface SessionSnapshot {
  queue: Track[];
  currentIndex: number;
  activeTrackId?: string;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  repeat: boolean;
  shuffle: boolean;
  tab: TabId;
  updatedAt?: number;
}

export interface PendingResume {
  videoId: string;
  seekTo: number;
  autoPlay: boolean;
}

export function resolveTrackSwitch(
  track: Track,
  sourceList: Track[] | undefined,
  currentQueue: Track[]
): { queue: Track[]; index: number } {
  const base = sourceList?.length ? sourceList : currentQueue;
  const idx = base.findIndex((t) => t.id === track.id);
  if (idx !== -1) {
    return { queue: base, index: idx };
  }
  return { queue: [track, ...base], index: 0 };
}

export function clearQueueKeepCurrent(
  queue: Track[],
  currentIndex: number
): { queue: Track[]; index: number } {
  const current = queue[currentIndex];
  return {
    queue: current ? [current] : [],
    index: 0,
  };
}

export function resolveExploreFallbackQueue(
  currentQueue: Track[],
  hasUserPlayback: boolean,
  exploreTracks: Track[]
): Track[] {
  if (hasUserPlayback || currentQueue.length > 0) return currentQueue;
  return exploreTracks;
}

export function resolveRestoredIndex(session: Pick<SessionSnapshot, "queue" | "currentIndex" | "activeTrackId">): number {
  if (!session.queue.length) return 0;
  const clamped = Math.min(Math.max(0, Number(session.currentIndex) || 0), session.queue.length - 1);
  if (session.activeTrackId && session.queue[clamped]?.id !== session.activeTrackId) {
    const matched = session.queue.findIndex((t) => t.id === session.activeTrackId);
    if (matched !== -1) return matched;
  }
  return clamped;
}

export function shouldAcceptPlayerEvent(
  eventVideoId: string | undefined,
  activeTrackId: string,
  loadingTargetId: string | null,
  eventState?: number,
  seenTransition?: boolean
): boolean {
  if (!activeTrackId) return false;
  if (eventVideoId && eventVideoId !== activeTrackId) return false;
  if (loadingTargetId) {
    if (eventVideoId === loadingTargetId) return true;
    // Fallback if YouTube's getVideoData() briefly returns empty after buffering -> playing
    if (!eventVideoId && seenTransition && eventState === 1) return true;
    return false;
  }
  return true;
}

export type ReadyAction =
  | { type: "none" }
  | { type: "load"; videoId: string; seekTo: number }
  | { type: "cue"; videoId: string; seekTo: number }
  | { type: "resume_initial"; seekTo: number; autoPlay: boolean };

export function resolveReadyAction(
  initialVideoId: string,
  pending: PendingResume | null
): ReadyAction {
  if (!pending) return { type: "none" };
  if (pending.videoId !== initialVideoId) {
    return pending.autoPlay
      ? { type: "load", videoId: pending.videoId, seekTo: pending.seekTo }
      : { type: "cue", videoId: pending.videoId, seekTo: pending.seekTo };
  }
  return {
    type: "resume_initial",
    seekTo: pending.seekTo,
    autoPlay: pending.autoPlay,
  };
}

export function shouldAttemptBackgroundResume({
  isHidden,
  wasPlaying,
  hiddenAtMs,
  manualPauseAtMs,
  nowMs,
  retryCount,
  maxRetries = 4,
}: {
  isHidden: boolean;
  wasPlaying: boolean;
  hiddenAtMs: number;
  manualPauseAtMs: number;
  nowMs: number;
  retryCount: number;
  maxRetries?: number;
}): boolean {
  if (!isHidden || !wasPlaying || retryCount >= maxRetries) return false;
  if (manualPauseAtMs > 0 && nowMs - manualPauseAtMs < 1500) return false;
  return hiddenAtMs > 0 && nowMs - hiddenAtMs < 5000;
}

export function shouldRestorePlayerAudio(
  playerMuted: boolean,
  playerVolume: number,
  userMuted: boolean,
  userVolume: number
): boolean {
  if (userMuted) return false;
  return playerMuted || (userVolume > 0 && playerVolume <= 0);
}
