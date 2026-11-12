"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fetchRelatedTracks,
  fetchTrackLyrics,
  fetchYouTubeAlbum,
  fetchYouTubeChannel,
  fetchYouTubeExplore,
  hydrateTrackDurations,
  resolveChannelFromVideo,
  searchYouTube,
  type AlbumSummary,
  type ArtistSummary,
  type ChannelInfo,
  type LyricsResult,
  type Track,
  type YouTubePlaylist,
} from "@/actions/youtube";
import { useMediaSession } from "@/hooks/use-media-session";
import { useYoutubePlayer } from "@/hooks/use-youtube-player";
import { parseDurationSec } from "@/lib/format";
import { createClockStore, type ClockStore } from "@/lib/playback-clock";
import {
  clearQueueKeepCurrent,
  resolveExploreFallbackQueue,
  resolveRestoredIndex,
  resolveTrackSwitch,
  type CustomPlaylist,
  type PendingResume,
  type SessionSnapshot,
  type TabId,
} from "@/lib/player-state";
import { computeRoomTime, sanitizeRoomCode, type RoomCommand, type RoomState } from "@/lib/room";
import {
  flushSessionSync,
  readStored,
  requestPersistentStorage,
  writeStored,
} from "@/lib/storage";

export interface TrackMenuState {
  track: Track;
  x: number;
  y: number;
  customPlaylistId?: string;
}

function isSameQueue(a: Track[], b: Track[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i]?.id);
}

function setRoomUrlParam(code: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function useNgePlay() {
  const [tab, setTab] = useState<TabId>("home");
  const [mobileVolOpen, setMobileVolOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState("");
  const [heroTitle, setHeroTitle] = useState("Loading YouTube Music...");
  const [results, setResults] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<{ album: AlbumSummary; tracks: Track[] } | null>(
    null
  );
  const [searching, setSearching] = useState(true);

  const [customPlaylists, setCustomPlaylists] = useState<CustomPlaylist[]>([]);
  const [activeCustomPlId, setActiveCustomPlId] = useState("");
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);

  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [channelTracks, setChannelTracks] = useState<Track[]>([]);
  const [channelCont, setChannelCont] = useState<string | undefined>();
  const [channelApiKey, setChannelApiKey] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [lyricVariantIdx, setLyricVariantIdx] = useState(0);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingTab, setNowPlayingTab] = useState<"upnext" | "lyrics" | "related">("upnext");
  const [relatedTracks, setRelatedTracks] = useState<Track[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const relatedForIdRef = useRef<string>("");

  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);

  const clockRef = useRef<ClockStore | null>(null);
  if (!clockRef.current) clockRef.current = createClockStore();
  const clock = clockRef.current;

  const hydratedRef = useRef(false);
  const hasUserPlaybackRef = useRef(false);
  const activeTrackIdRef = useRef<string>("");
  const userKeyRef = useRef("guest");
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const clientIdRef = useRef("");
  const clockOffsetRef = useRef(0);
  const lastAppliedVersionRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onTrackEndedRef = useRef<() => boolean>(() => false);

  const queueRef = useRef<Track[]>(queue);
  const currentIndexRef = useRef<number>(currentIndex);
  const stateRef = useRef({
    queue,
    currentIndex,
    isPlaying,
    volume,
    muted,
    repeat,
    shuffle,
    tab,
  });

  useEffect(() => {
    queueRef.current = queue;
    currentIndexRef.current = currentIndex;
    stateRef.current = { queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, tab };
  }, [queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, tab]);

  const currentTrack = queue[currentIndex];
  useEffect(() => {
    activeTrackIdRef.current = currentTrack?.id || "";
  }, [currentTrack?.id]);

  const playTrackAtRef = useRef<(index: number, list: Track[]) => void>(() => {});

  const saveSession = useCallback(
    (
      overrides?: Partial<SessionSnapshot>,
      syncFlush = false
    ) => {
      if (!hydratedRef.current || roomRef.current) return;
      const q = overrides?.queue ?? queueRef.current;
      if (!q.length) return;
      const idx = Math.min(
        Math.max(0, overrides?.currentIndex ?? currentIndexRef.current),
        q.length - 1
      );
      const s = stateRef.current;
      const snap: SessionSnapshot = {
        queue: q.slice(0, 60),
        currentIndex: idx,
        activeTrackId: overrides?.activeTrackId ?? q[idx]?.id,
        currentTime: overrides?.currentTime ?? clock.getSnapshot().currentTime,
        isPlaying: overrides?.isPlaying ?? s.isPlaying,
        volume: overrides?.volume ?? s.volume,
        muted: overrides?.muted ?? s.muted,
        repeat: overrides?.repeat ?? s.repeat,
        shuffle: overrides?.shuffle ?? s.shuffle,
        tab: overrides?.tab ?? (s.tab === "playlist" ? "home" : s.tab),
        updatedAt: Date.now(),
      };
      void writeStored("session", userKeyRef.current, snap);
      if (syncFlush) flushSessionSync(userKeyRef.current, snap);
    },
    [clock]
  );

  const player = useYoutubePlayer({
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
    onAdvanceTrack: (idx, list) => playTrackAtRef.current(idx, list),
    onTrackEnded: () => onTrackEndedRef.current(),
    onSaveSession: saveSession,
  });

  const getClientId = useCallback(() => {
    if (!clientIdRef.current) {
      clientIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return clientIdRef.current;
  }, []);

  const syncClockOffset = useCallback((serverNow: number, t0?: number) => {
    const t1 = Date.now();
    const refTime = t0 !== undefined ? (t0 + t1) / 2 : t1;
    clockOffsetRef.current = serverNow - refTime;
  }, []);

  const clearRoomLocal = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    roomRef.current = null;
    lastAppliedVersionRef.current = 0;
    setRoom(null);
    setRoomUrlParam(null);
  }, []);

  const applyRoomSnapshot = useCallback(
    (nextRoom: RoomState, serverNow: number) => {
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      if (nextRoom.version <= lastAppliedVersionRef.current) return;
      lastAppliedVersionRef.current = nextRoom.version;
      hasUserPlaybackRef.current = true;

      const targetTime = computeRoomTime(nextRoom, serverNow);
      if (!isSameQueue(queueRef.current, nextRoom.queue)) {
        queueRef.current = nextRoom.queue;
        setQueue(nextRoom.queue);
      }

      const prevTrackId = activeTrackIdRef.current;
      const nextTrack = nextRoom.queue[nextRoom.currentIndex];
      currentIndexRef.current = nextRoom.currentIndex;
      setCurrentIndex(nextRoom.currentIndex);

      if (!nextTrack) {
        activeTrackIdRef.current = "";
        setIsPlaying(false);
        clock.set(0, 0);
        return;
      }

      activeTrackIdRef.current = nextTrack.id;
      if (nextTrack.id !== prevTrackId) {
        clock.set(targetTime, 0);
        setIsPlaying(nextRoom.isPlaying);
        setHistory((prev) => {
          const next = [nextTrack, ...prev.filter((t) => t.id !== nextTrack.id)].slice(0, 30);
          void writeStored("history", userKeyRef.current, next);
          return next;
        });
        player.loadVideo(nextTrack.id, targetTime, nextRoom.isPlaying);
        return;
      }

      const localTime = clock.getSnapshot().currentTime;
      const wasPlaying = stateRef.current.isPlaying;
      if (nextRoom.isPlaying !== wasPlaying) {
        setIsPlaying(nextRoom.isPlaying);
        if (nextRoom.isPlaying) {
          if (Math.abs(localTime - targetTime) > 1.5) player.seekTo(targetTime);
          player.playVideo();
        } else {
          player.pauseVideo();
          clock.set(targetTime);
          if (Math.abs(localTime - targetTime) > 0.8) player.seekTo(targetTime);
        }
      } else if (Math.abs(localTime - targetTime) > (nextRoom.isPlaying ? 1.8 : 0.8)) {
        player.seekTo(targetTime);
        clock.set(targetTime);
      }
    },
    [clock, player]
  );

  const connectRoomStream = useCallback(
    (code: string) => {
      eventSourceRef.current?.close();
      const es = new EventSource(
        `/api/room?code=${encodeURIComponent(code)}&clientId=${encodeURIComponent(getClientId())}`
      );
      eventSourceRef.current = es;
      es.addEventListener("state", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            room: RoomState;
            serverNow: number;
          };
          syncClockOffset(data.serverNow);
          applyRoomSnapshot(data.room, data.serverNow);
        } catch {}
      });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED && roomRef.current?.code === code) {
          clearRoomLocal();
          toast.error("Room ended");
        }
      };
    },
    [applyRoomSnapshot, clearRoomLocal, getClientId, syncClockOffset]
  );

  const sendRoomCommand = useCallback(
    async (command: RoomCommand) => {
      const cur = roomRef.current;
      if (!cur) return;
      const t0 = Date.now();
      try {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "command",
            code: cur.code,
            clientId: getClientId(),
            command,
          }),
        });
        if (res.status === 404) {
          clearRoomLocal();
          toast.error("Room not found");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { room: RoomState; serverNow: number };
        syncClockOffset(data.serverNow, t0);
        applyRoomSnapshot(data.room, data.serverNow);
      } catch {}
    },
    [applyRoomSnapshot, clearRoomLocal, getClientId, syncClockOffset]
  );

  const createRoom = useCallback(async () => {
    setRoomBusy(true);
    const t0 = Date.now();
    try {
      const q = queueRef.current.length ? queueRef.current : results.length ? results : trending;
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "create",
          clientId: getClientId(),
          queue: q,
          currentIndex: queueRef.current.length ? currentIndexRef.current : 0,
          currentTime: queueRef.current.length ? clock.getSnapshot().currentTime : 0,
          isPlaying: queueRef.current.length ? stateRef.current.isPlaying : false,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { room: RoomState; serverNow: number };
      syncClockOffset(data.serverNow, t0);
      roomRef.current = data.room;
      lastAppliedVersionRef.current = data.room.version;
      setRoom(data.room);
      setRoomUrlParam(data.room.code);
      connectRoomStream(data.room.code);
      toast.success(`Room ${data.room.code} created`);
    } catch {
      toast.error("Failed to create room");
    } finally {
      setRoomBusy(false);
    }
  }, [clock, connectRoomStream, getClientId, results, syncClockOffset, trending]);

  const joinRoom = useCallback(
    async (rawCode: string, silent = false): Promise<boolean> => {
      const code = sanitizeRoomCode(rawCode);
      if (!code) return false;
      setRoomBusy(true);
      const t0 = Date.now();
      try {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "join", code, clientId: getClientId() }),
        });
        if (!res.ok) {
          if (silent) setRoomUrlParam(null);
          toast.error("Room not found");
          return false;
        }
        const data = (await res.json()) as { room: RoomState; serverNow: number };
        syncClockOffset(data.serverNow, t0);
        lastAppliedVersionRef.current = 0;
        applyRoomSnapshot(data.room, data.serverNow);
        setRoomUrlParam(data.room.code);
        connectRoomStream(data.room.code);
        toast.success(`Joined room ${data.room.code}`);
        return true;
      } catch {
        toast.error("Failed to join room");
        return false;
      } finally {
        setRoomBusy(false);
      }
    },
    [applyRoomSnapshot, connectRoomStream, getClientId, syncClockOffset]
  );

  const leaveRoom = useCallback(() => {
    const code = roomRef.current?.code;
    clearRoomLocal();
    if (code) {
      void fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "leave", code, clientId: getClientId() }),
      }).catch(() => {});
    }
    toast.success("Left room");
  }, [clearRoomLocal, getClientId]);

  const joinRoomRef = useRef(joinRoom);
  joinRoomRef.current = joinRoom;

  onTrackEndedRef.current = () => {
    if (!roomRef.current) return false;
    void sendRoomCommand({
      type: "next",
      shuffle: stateRef.current.shuffle,
      baseVersion: roomRef.current.version,
    });
    return true;
  };

  const playTrackAt = useCallback(
    (index: number, list = queueRef.current) => {
      const track = list[index];
      if (!track) return;

      hasUserPlaybackRef.current = true;
      queueRef.current = list;
      currentIndexRef.current = index;
      activeTrackIdRef.current = track.id;

      clock.set(0, 0);
      setCurrentIndex(index);
      setIsPlaying(true);

      setHistory((prev) => {
        const next = [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 30);
        void writeStored("history", userKeyRef.current, next);
        return next;
      });

      if (roomRef.current) {
        const queueChanged = !isSameQueue(roomRef.current.queue, list);
        player.loadVideo(track.id, 0, true);
        void sendRoomCommand({
          type: "setTrack",
          index,
          queue: queueChanged ? list : undefined,
          autoPlay: true,
        });
        return;
      }

      saveSession(
        {
          queue: list,
          currentIndex: index,
          activeTrackId: track.id,
          currentTime: 0,
          isPlaying: true,
        },
        true
      );
      player.loadVideo(track.id, 0, true);
    },
    [clock, player, saveSession, sendRoomCommand]
  );

  playTrackAtRef.current = playTrackAt;

  const playTrackNow = useCallback(
    (track: Track, sourceList?: Track[]) => {
      const { queue: nextQueue, index } = resolveTrackSwitch(
        track,
        sourceList,
        queueRef.current
      );
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      playTrackAt(index, nextQueue);
    },
    [playTrackAt]
  );

  const handleNext = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    if (roomRef.current) {
      if (!stateRef.current.shuffle) {
        const idx = (currentIndexRef.current + 1) % q.length;
        const nextTrack = q[idx];
        if (nextTrack) {
          currentIndexRef.current = idx;
          activeTrackIdRef.current = nextTrack.id;
          clock.set(0, 0);
          setCurrentIndex(idx);
          setIsPlaying(true);
          player.loadVideo(nextTrack.id, 0, true);
        }
      }
      void sendRoomCommand({ type: "next", shuffle: stateRef.current.shuffle });
      return;
    }
    const idx = stateRef.current.shuffle
      ? Math.floor(Math.random() * q.length)
      : (currentIndexRef.current + 1) % q.length;
    playTrackAt(idx, q);
  }, [clock, player, playTrackAt, sendRoomCommand]);

  const handlePrev = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    const curTime = clock.getSnapshot().currentTime;
    if (roomRef.current) {
      if (curTime > 4) {
        player.seekTo(0);
      } else {
        const idx = (currentIndexRef.current - 1 + q.length) % q.length;
        const prevTrack = q[idx];
        if (prevTrack) {
          currentIndexRef.current = idx;
          activeTrackIdRef.current = prevTrack.id;
          clock.set(0, 0);
          setCurrentIndex(idx);
          setIsPlaying(true);
          player.loadVideo(prevTrack.id, 0, true);
        }
      }
      void sendRoomCommand({ type: "prev", atTime: curTime });
      return;
    }
    if (curTime > 4) {
      player.seekTo(0);
      return;
    }
    playTrackAt((currentIndexRef.current - 1 + q.length) % q.length, q);
  }, [clock, player, playTrackAt, sendRoomCommand]);

  const handleTogglePlay = useCallback(() => {
    if (!roomRef.current) {
      player.togglePlay();
      return;
    }
    const nextPlaying = !stateRef.current.isPlaying;
    if (nextPlaying) player.playVideo();
    else player.pauseVideo();
    void sendRoomCommand({
      type: nextPlaying ? "play" : "pause",
      atTime: clock.getSnapshot().currentTime,
    });
  }, [clock, player, sendRoomCommand]);

  const handleSeek = useCallback(
    (val: number) => {
      player.seekTo(val);
      if (roomRef.current) {
        void sendRoomCommand({ type: "seek", toTime: val });
      }
    },
    [player, sendRoomCommand]
  );

  const handlePlayAction = useCallback(() => {
    player.playVideo();
    if (roomRef.current) {
      void sendRoomCommand({ type: "play", atTime: clock.getSnapshot().currentTime });
    }
  }, [clock, player, sendRoomCommand]);

  const handlePauseAction = useCallback(() => {
    player.pauseVideo();
    if (roomRef.current) {
      void sendRoomCommand({ type: "pause", atTime: clock.getSnapshot().currentTime });
    }
  }, [clock, player, sendRoomCommand]);

  useMediaSession({
    currentTrack,
    isPlaying,
    onPlay: handlePlayAction,
    onPause: handlePauseAction,
    onPrev: handlePrev,
    onNext: handleNext,
    onSeek: handleSeek,
  });

  useEffect(() => {
    let cancelled = false;
    requestPersistentStorage();

    async function boot() {
      const explorePromise = fetchYouTubeExplore();
      const uid = "guest";
      userKeyRef.current = uid;
      const [storedLiked, storedHistory, storedPls, idbSession] = await Promise.all([
        readStored<Track[]>("liked", uid),
        readStored<Track[]>("history", uid),
        readStored<CustomPlaylist[]>("playlists", uid),
        readStored<SessionSnapshot>("session", uid),
      ]);
      if (cancelled) return;

      let bestSession = idbSession;
      try {
        const rawSync = localStorage.getItem(`ngeplay_session_${uid}`);
        if (rawSync) {
          const parsedSync = JSON.parse(rawSync) as SessionSnapshot;
          if (
            parsedSync?.queue?.length &&
            (!bestSession || (parsedSync.updatedAt || 0) > (bestSession.updatedAt || 0))
          ) {
            bestSession = parsedSync;
            void writeStored("session", uid, parsedSync);
          }
        }
      } catch {}

      const parsedLiked = Array.isArray(storedLiked) ? storedLiked : [];
      const parsedHistory = Array.isArray(storedHistory) ? storedHistory : [];
      const parsedPls = Array.isArray(storedPls) ? storedPls : [];
      setLiked(parsedLiked);
      setHistory(parsedHistory);
      setCustomPlaylists(parsedPls);

      const urlRoom = sanitizeRoomCode(
        new URLSearchParams(window.location.search).get("room") || ""
      );
      const joinedRoom = urlRoom ? await joinRoomRef.current(urlRoom, true) : false;
      if (cancelled) return;

      let parsedQueue: Track[] = [];
      let hadSavedQueue = joinedRoom;
      if (!joinedRoom && !hasUserPlaybackRef.current && bestSession?.queue?.length) {
        hadSavedQueue = true;
        parsedQueue = bestSession.queue;
        const idx = resolveRestoredIndex(bestSession);
        const restoredTrack = bestSession.queue[idx];
        const restoredTime = Number(bestSession.currentTime) || 0;

        queueRef.current = bestSession.queue;
        currentIndexRef.current = idx;
        activeTrackIdRef.current = restoredTrack?.id || "";

        setQueue(bestSession.queue);
        setCurrentIndex(idx);
        clock.set(restoredTime, 0);
        if (typeof bestSession.volume === "number") setVolume(bestSession.volume);
        if (typeof bestSession.muted === "boolean") setMuted(bestSession.muted);
        if (typeof bestSession.repeat === "boolean") setRepeat(bestSession.repeat);
        if (typeof bestSession.shuffle === "boolean") setShuffle(bestSession.shuffle);
        if (
          ["home", "songs", "albums", "artists", "liked", "history", "queue", "library"].includes(
            bestSession.tab
          )
        ) {
          setTab(bestSession.tab);
        }
        if (restoredTrack?.id) {
          pendingResumeRef.current = {
            videoId: restoredTrack.id,
            seekTo: restoredTime,
            autoPlay: Boolean(bestSession.isPlaying),
          };
        }
      } else if (joinedRoom && bestSession) {
        if (typeof bestSession.volume === "number") setVolume(bestSession.volume);
        if (typeof bestSession.muted === "boolean") setMuted(bestSession.muted);
      }

      hydratedRef.current = true;

      const needDur = [...parsedQueue, ...parsedHistory, ...parsedLiked].filter(
        (t) => t?.id && (!t.duration || t.duration === "—")
      );
      if (needDur.length) {
        hydrateTrackDurations(needDur).then((filled) => {
          if (cancelled) return;
          const map = new Map(filled.map((t) => [t.id, t.duration]));
          const patch = (list: Track[]) =>
            list.map((t) =>
              (!t.duration || t.duration === "—") && map.get(t.id)
                ? { ...t, duration: map.get(t.id)! }
                : t
            );
          setQueue((q) => {
            const next = patch(q);
            queueRef.current = next;
            return next;
          });
          setHistory((prev) => patch(prev));
          setLiked((prev) => patch(prev));
        });
      }

      const data = await explorePromise;
      if (cancelled) return;
      setPlaylists(data.playlists);
      setActivePlaylistId(data.activePlaylistId);
      setHeroTitle(data.activeTitle);
      setResults(data.tracks);
      setTrending(data.trending);
      setAlbums(data.albums);
      setArtists(data.artists);

      const nextQueue = resolveExploreFallbackQueue(
        queueRef.current,
        hasUserPlaybackRef.current || hadSavedQueue,
        data.tracks
      );
      if (nextQueue !== queueRef.current && nextQueue.length > 0) {
        queueRef.current = nextQueue;
        currentIndexRef.current = 0;
        activeTrackIdRef.current = nextQueue[0].id;
        setQueue(nextQueue);
        setCurrentIndex(0);
      }
      setSearching(false);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [clock]);

  useEffect(() => {
    saveSession();
  }, [queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, tab, saveSession]);

  const parsedTrackDur = currentTrack ? parseDurationSec(currentTrack.duration) : 0;
  const fallbackRoundDur = parsedTrackDur > 0 ? parsedTrackDur : 0;

  useEffect(() => {
    if (!currentTrack?.id) return;
    let cancelled = false;
    setLoadingLyrics(true);
    setLyrics(null);
    setLyricVariantIdx(0);
    const durForLookup = fallbackRoundDur || Math.round(clock.getSnapshot().duration) || undefined;
    fetchTrackLyrics(currentTrack.title, currentTrack.channel, durForLookup)
      .then((res) => {
        if (!cancelled) setLyrics(res);
      })
      .finally(() => {
        if (!cancelled) setLoadingLyrics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.channel, fallbackRoundDur, clock]);

  useEffect(() => {
    if (!nowPlayingOpen || nowPlayingTab !== "related" || !currentTrack?.id) return;
    if (relatedForIdRef.current === currentTrack.id) return;
    let cancelled = false;
    setLoadingRelated(true);
    fetchRelatedTracks(currentTrack.id)
      .then((items) => {
        if (!cancelled) {
          relatedForIdRef.current = currentTrack.id;
          setRelatedTracks(items);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRelated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nowPlayingOpen, nowPlayingTab, currentTrack?.id]);

  const playerSeekRef = useRef(player.seekTo);
  playerSeekRef.current = player.seekTo;

  useEffect(() => {
    if (!room?.code || !room.isPlaying) return;
    const timer = setInterval(() => {
      const cur = roomRef.current;
      if (!cur || !cur.isPlaying) return;
      const expected = computeRoomTime(cur, Date.now() + clockOffsetRef.current);
      const actual = clock.getSnapshot().currentTime;
      if (Math.abs(actual - expected) > 2.0) {
        playerSeekRef.current(expected);
        clock.set(expected);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [room?.code, room?.isPlaying, clock]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNowPlayingOpen(false);
        setMobileVolOpen(false);
        setNewPlaylistOpen(false);
        setRoomModalOpen(false);
        setTrackMenu(null);
      }
    };
    const onDown = () => {
      setTrackMenu(null);
      setMobileVolOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  function handleVolume(val: number) {
    setVolume(val);
    setMuted(val === 0);
    player.setPlayerVolume(val);
  }

  function toggleMute() {
    const nextMuted = !muted;
    player.setPlayerMuted(nextMuted, volume || 80);
    setMuted(nextMuted);
  }

  function toggleLike(track: Track, e?: React.MouseEvent) {
    e?.stopPropagation();
    setLiked((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      const next = exists ? prev.filter((t) => t.id !== track.id) : [track, ...prev];
      void writeStored("liked", userKeyRef.current, next);
      return next;
    });
  }

  async function openChannel(target: Track | ArtistSummary | string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setNowPlayingOpen(false);
    setSearching(true);
    setActiveAlbum(null);
    setTab("artists");
    try {
      let cid: string | undefined;
      let knownName: string | undefined;
      if (typeof target === "string") {
        cid = target;
      } else if ("name" in target) {
        cid = target.id;
        knownName = target.name;
      } else {
        cid = target.channelId;
        knownName = target.channel;
        if (!cid) cid = (await resolveChannelFromVideo(target.id)) || undefined;
      }
      if (!cid) {
        toast.error("Artist channel not found");
        setTab("home");
        return;
      }
      const data = await fetchYouTubeChannel(cid, undefined, undefined, knownName);
      if (!data) {
        toast.error("Failed to load artist tracks");
        setTab("home");
        return;
      }
      setChannelInfo(data.channel);
      setChannelTracks(data.tracks);
      setChannelCont(data.continuation);
      setChannelApiKey(data.apiKey);
    } finally {
      setSearching(false);
    }
  }

  async function openAlbum(album: AlbumSummary) {
    if (!album.id) return;
    setSearching(true);
    setChannelInfo(null);
    setTab("albums");
    try {
      const data = await fetchYouTubeAlbum(album.id);
      if (!data) {
        toast.error("Failed to load album");
        return;
      }
      setActiveAlbum(data);
    } finally {
      setSearching(false);
    }
  }

  async function loadMoreChannel() {
    if (!channelInfo?.id || !channelCont || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchYouTubeChannel(
        channelInfo.id,
        channelCont,
        channelApiKey,
        channelInfo.title
      );
      if (more?.tracks.length) {
        setChannelTracks((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          return [...prev, ...more.tracks.filter((t) => !seen.has(t.id))];
        });
        setChannelCont(more.continuation);
      } else {
        setChannelCont(undefined);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSelectPlaylist(pl: YouTubePlaylist) {
    setSearching(true);
    setActiveAlbum(null);
    setChannelInfo(null);
    setTab("songs");
    setActivePlaylistId(pl.id);
    setHeroTitle(pl.title);
    try {
      const data = await fetchYouTubeExplore(pl.id);
      if (data.tracks.length) setResults(data.tracks);
      else toast.error("Failed to load YouTube Music playlist");
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(searchQuery: string) {
    const q = searchQuery.trim();
    if (!q) return;
    const chMatch = q.match(/(?:music\.)?youtube\.com\/(?:channel\/(UC[\w-]+)|(@[\w.-]+))/i);
    if (chMatch) return openChannel(chMatch[1] || chMatch[2]);
    if (q.startsWith("@") && !q.includes(" ")) return openChannel(q);

    setSearching(true);
    setActiveAlbum(null);
    setChannelInfo(null);
    setTab("songs");
    setActivePlaylistId("");
    setHeroTitle(`Results: ${q}`);
    try {
      const items = await searchYouTube(q);
      if (!items.length) toast.error("No tracks found on YouTube Music");
      else setResults(items);
    } finally {
      setSearching(false);
    }
  }

  function saveCustomPlaylists(next: CustomPlaylist[]) {
    setCustomPlaylists(next);
    void writeStored("playlists", userKeyRef.current, next);
  }

  function createCustomPlaylist(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created: CustomPlaylist = {
      id: `pl_${Date.now()}`,
      name: trimmed,
      tracks: [],
    };
    saveCustomPlaylists([...customPlaylists, created]);
    setNewPlaylistName("");
    setNewPlaylistOpen(false);
    setActiveCustomPlId(created.id);
    setTab("playlist");
    toast.success(`Created "${trimmed}"`);
  }

  function addTrackToPlaylist(playlistId: string, track: Track) {
    const target = customPlaylists.find((p) => p.id === playlistId);
    if (!target) return;
    if (target.tracks.some((t) => t.id === track.id)) {
      return toast.info(`Already in "${target.name}"`);
    }
    const next = customPlaylists.map((p) =>
      p.id === playlistId ? { ...p, tracks: [...p.tracks, track] } : p
    );
    saveCustomPlaylists(next);
    toast.success(`Added to "${target.name}"`);
  }

  function removeTrackFromPlaylist(playlistId: string, trackId: string) {
    const next = customPlaylists.map((p) =>
      p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
    );
    saveCustomPlaylists(next);
  }

  function deleteCustomPlaylist(playlistId: string) {
    saveCustomPlaylists(customPlaylists.filter((p) => p.id !== playlistId));
    if (activeCustomPlId === playlistId) {
      setTab(window.innerWidth < 1024 ? "library" : "home");
    }
    toast.success("Playlist deleted");
  }

  function clearQueue() {
    const { queue: nextQ, index } = clearQueueKeepCurrent(
      queueRef.current,
      currentIndexRef.current
    );
    queueRef.current = nextQ;
    currentIndexRef.current = index;
    setQueue(nextQ);
    setCurrentIndex(index);
    if (roomRef.current) {
      void sendRoomCommand({ type: "clearQueue" });
    }
  }

  function playAll(tracks: Track[]) {
    if (!tracks.length) return;
    queueRef.current = tracks;
    setQueue(tracks);
    playTrackAt(0, tracks);
  }

  function openTrackMenu(track: Track, e: React.MouseEvent, customPlaylistId?: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(window.innerWidth - 220, Math.max(12, rect.right - 208));
    const y = Math.min(window.innerHeight - 280, Math.max(12, rect.bottom + 6));
    setTrackMenu({ track, x, y, customPlaylistId });
  }

  return {
    tab,
    setTab,
    mobileVolOpen,
    setMobileVolOpen,
    query,
    setQuery,
    playlists,
    activePlaylistId,
    heroTitle,
    results,
    trending,
    albums,
    artists,
    activeAlbum,
    setActiveAlbum,
    searching,
    customPlaylists,
    activeCustomPlId,
    setActiveCustomPlId,
    newPlaylistOpen,
    setNewPlaylistOpen,
    newPlaylistName,
    setNewPlaylistName,
    trackMenu,
    setTrackMenu,
    channelInfo,
    setChannelInfo,
    channelTracks,
    channelCont,
    loadingMore,
    lyrics,
    loadingLyrics,
    lyricVariantIdx,
    setLyricVariantIdx,
    nowPlayingOpen,
    setNowPlayingOpen,
    nowPlayingTab,
    setNowPlayingTab,
    relatedTracks,
    loadingRelated,
    queue,
    currentIndex,
    currentTrack,
    liked,
    history,
    isPlaying,
    volume,
    muted,
    repeat,
    setRepeat,
    shuffle,
    setShuffle,
    clock,
    room,
    roomModalOpen,
    setRoomModalOpen,
    roomBusy,
    createRoom,
    joinRoom,
    leaveRoom,
    playTrackAt,
    playTrackNow,
    playAll,
    clearQueue,
    togglePlay: handleTogglePlay,
    handleNext,
    handlePrev,
    handleSeek,
    handleVolume,
    toggleMute,
    toggleLike,
    openChannel,
    openAlbum,
    loadMoreChannel,
    handleSelectPlaylist,
    handleSearch,
    createCustomPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    deleteCustomPlaylist,
    openTrackMenu,
  };
}


