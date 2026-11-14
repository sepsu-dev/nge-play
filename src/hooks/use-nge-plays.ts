"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { fetchTrackLyrics, type LyricsResult } from "@/actions/lyrics";
import {
  fetchRelatedTracks,
  fetchYouTubeAlbum,
  fetchYouTubeChannel,
  fetchYouTubeExplore,
  hydrateTrackDurations,
  resolveChannelFromVideo,
  searchYouTubeMusic,
  type AlbumSummary,
  type ArtistSummary,
  type ChannelInfo,
  type YouTubePlaylist,
} from "@/actions/youtube";
import { useMediaSession } from "@/hooks/use-media-session";
import type { Track } from "@/actions/ytm-core";
import { isSameQueue, useRoomSync, type RoomPlayerBridge } from "@/hooks/use-room-sync";
import { useYoutubePlayer } from "@/hooks/use-youtube-player";
import { useNavigate, useReplace, useRoute } from "@/hooks/use-route";
import { createTtlCache, getClientHint } from "@/lib/client-cache";
import { parseDurationSec } from "@/lib/format";
import { createClockStore, type ClockStore } from "@/lib/playback-clock";
import {
  clearQueueKeepCurrent,
  createPlaylistId,
  migratePlaylistIds,
  resolveExploreFallbackQueue,
  resolveRestoredIndex,
  resolveTrackSwitch,
  type CustomPlaylist,
  type PendingResume,
  type SessionSnapshot,
  type TabId,
  type TrackMenuState,
} from "@/lib/player-state";
import { sanitizeRoomCode } from "@/lib/room";
import { normalizePlaylistId, ROUTES, tabToRoute, type Route } from "@/lib/routes";
import {
  flushSessionSync,
  readStored,
  requestPersistentStorage,
  writeStored,
} from "@/lib/storage";

// ponytail: client-side TTL caches — repeat searches/playlist switches cost zero requests.
// Module scope so they survive component re-mounts within the same tab.
type ExploreData = Awaited<ReturnType<typeof fetchYouTubeExplore>>;
type SearchData = Awaited<ReturnType<typeof searchYouTubeMusic>>;
type ChannelData = NonNullable<Awaited<ReturnType<typeof fetchYouTubeChannel>>>;
type AlbumData = NonNullable<Awaited<ReturnType<typeof fetchYouTubeAlbum>>>;

const exploreClientCache = createTtlCache<ExploreData>(10 * 60 * 1000, 20);
const searchClientCache = createTtlCache<SearchData>(5 * 60 * 1000, 30);
const channelClientCache = createTtlCache<ChannelData>(10 * 60 * 1000, 20);
const albumClientCache = createTtlCache<AlbumData>(10 * 60 * 1000, 20);

function cachedFetchYouTubeExplore(playlistId: string | undefined, clientHint: string) {
  const key = `explore:${clientHint}:${playlistId || "__default__"}`;
  return exploreClientCache.get(key) ?? fetchYouTubeExplore(playlistId, clientHint).then((d) => exploreClientCache.set(key, d));
}

function cachedSearchYouTubeMusic(q: string, clientHint: string) {
  const key = `search:${clientHint}:${q.toLowerCase()}`;
  return searchClientCache.get(key) ?? searchYouTubeMusic(q, clientHint).then((d) => searchClientCache.set(key, d));
}

function cachedFetchYouTubeChannel(channelId: string, continuation: string | undefined, knownTitle?: string) {
  const key = `channel:${channelId}:${continuation || "__first__"}`;
  return channelClientCache.get(key) ?? fetchYouTubeChannel(channelId, continuation, knownTitle).then((d) => {
    if (d) channelClientCache.set(key, d);
    return d;
  });
}

function cachedFetchYouTubeAlbum(albumId: string) {
  const key = `album:${albumId}`;
  return albumClientCache.get(key) ?? fetchYouTubeAlbum(albumId).then((d) => {
    if (d) albumClientCache.set(key, d);
    return d;
  });
}

export function useNgePlay() {
  // Rute aktif (berbasis URL). `tab` adalah alias kompatibilitas yang diturunkan dari sini,
  // sehingga sidebar/footer/list cukup membaca satu sumber kebenaran.
  const route = useRoute();
  const goTo = useNavigate();
  const goReplace = useReplace();
  const [tab, setTabState] = useState<TabId>(route.tab);
  const routeRef = useRef(route);
  routeRef.current = route;

  // navigate: satu-satunya cara berpindah menu — memakai router Next sehingga
  // URL berubah DAN halaman tujuan dirender, tanpa me-remount player (ada di layout).
  // `route.path` dihitung ulang dari tab+entityId agar URL detail (mis. /library/playlist/<id>)
  // konsisten walau pemanggil hanya mengisi salah satunya.
  const navigate = useCallback(
    (next: Route) => {
      setTabState(next.tab);
      goTo(tabToRoute(next.tab, next.entityId, next.query));
    },
    [goTo]
  );

  // Redirect koreksi (link rusak / data gagal dimuat) tanpa menambah history.
  const replaceRoute = useCallback(
    (next: Route) => {
      setTabState(next.tab);
      goReplace(tabToRoute(next.tab, next.entityId, next.query));
    },
    [goReplace]
  );

  // setTab tetap ada supaya handler lama tidak perlu diubah; sekarang menerjemahkan
  // ke rute agar URL selalu konsisten dengan layar.
  const setTab = useCallback(
    (next: TabId) => {
      navigate(tabToRoute(next));
    },
    [navigate]
  );

  // Dipakai route saat dibuka langsung: samakan layar dengan URL tanpa push (URL sudah benar).
  const syncRoute = useCallback((nextTab: TabId, entityId?: string) => {
    setTabState(nextTab);
    if (nextTab === "playlist" && entityId) setActiveCustomPlId(normalizePlaylistId(entityId));
  }, []);

  const [mobileVolOpen, setMobileVolOpen] = useState(false);
  const [openingTarget, setOpeningTarget] = useState<"album" | "artist" | null>(null);

  // Search & Browse
  const [query, setQuery] = useState("");
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState("");
  const [heroTitle, setHeroTitle] = useState("Loading YouTube Music...");
  const [results, setResults] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<{ album: AlbumSummary; tracks: Track[] } | null>(null);
  const [searching, setSearching] = useState(true);
  const [hydrating, setHydrating] = useState(true);

  // Custom Playlists & Menu
  const [customPlaylists, setCustomPlaylists] = useState<CustomPlaylist[]>([]);
  /** id lama (non-UUID) -> UUID hasil migrasi, untuk membuka link/bookmark lama. */
  const [playlistAliases, setPlaylistAliases] = useState<Record<string, string>>({});
  const [activeCustomPlId, setActiveCustomPlId] = useState("");
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  // Modal playlist dipakai untuk dua hal: membuat baru ("create") atau mengganti nama ("rename").
  const [playlistModalMode, setPlaylistModalMode] = useState<"create" | "rename">("create");
  const [renamePlaylistId, setRenamePlaylistId] = useState("");
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);

  // Artist Channel Details
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [channelTracks, setChannelTracks] = useState<Track[]>([]);
  const [channelCont, setChannelCont] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  // Lyrics & Related
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [lyricVariantIdx, setLyricVariantIdx] = useState(0);
  const [lyricOffset, setLyricOffset] = useState(0);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingTab, setNowPlayingTab] = useState<"upnext" | "lyrics" | "related">("upnext");
  const [relatedTracks, setRelatedTracks] = useState<Track[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const relatedForIdRef = useRef<string>("");

  // Queue, Liked & History
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);

  // Playback Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSignal, setPlaybackSignal] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const clockRef = useRef<ClockStore | null>(null);
  if (!clockRef.current) clockRef.current = createClockStore();
  const clock = clockRef.current;

  const hydratedRef = useRef(false);
  const hasUserPlaybackRef = useRef(false);
  const activeTrackIdRef = useRef<string>("");
  const userKeyRef = useRef("guest");
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const playerRef = useRef<RoomPlayerBridge | null>(null);
  const onTrackEndedRef = useRef<() => boolean>(() => false);
  const onPlayerPlayingRef = useRef<(actualTime: number) => void>(() => {});

  const queueRef = useRef<Track[]>(queue);
  const currentIndexRef = useRef<number>(currentIndex);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const resultsRef = useRef<Track[]>(results);
  const trendingRef = useRef<Track[]>(trending);
  const lyricPrefsRef = useRef({ variantIdx: lyricVariantIdx, offset: lyricOffset });
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
    isPlayingRef.current = isPlaying;
    resultsRef.current = results;
    trendingRef.current = trending;
    lyricPrefsRef.current = { variantIdx: lyricVariantIdx, offset: lyricOffset };
    stateRef.current = { queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, tab };
  }, [
    queue,
    currentIndex,
    isPlaying,
    volume,
    muted,
    repeat,
    shuffle,
    tab,
    results,
    trending,
    lyricVariantIdx,
    lyricOffset,
  ]);

  const currentTrack = queue[currentIndex];
  useEffect(() => {
    activeTrackIdRef.current = currentTrack?.id || "";
  }, [currentTrack?.id]);

  const playTrackAtRef = useRef<(index: number, list: Track[]) => void>(() => {});

  const recordHistory = useCallback((track: Track) => {
    setHistory((prev) => {
      const next = [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 30);
      void writeStored("history", userKeyRef.current, next);
      return next;
    });
  }, []);

  const roomSync = useRoomSync({
    clock,
    playerRef,
    queueRef,
    currentIndexRef,
    activeTrackIdRef,
    hasUserPlaybackRef,
    isPlayingRef,
    getFallbackQueue: () => (resultsRef.current.length ? resultsRef.current : trendingRef.current),
    getLyricPrefs: () => lyricPrefsRef.current,
    onQueueSync: setQueue,
    onIndexSync: setCurrentIndex,
    onPlayingSync: setIsPlaying,
    onLyricPrefsSync: (variantIdx, offset) => {
      setLyricVariantIdx(variantIdx);
      setLyricOffset(offset);
    },
    onRecordHistory: recordHistory,
  });

  const {
    room,
    roomRef,
    roomModalOpen,
    setRoomModalOpen,
    roomBusy,
    memberId,
    memberName,
    memberIcon,
    createRoom,
    joinRoom,
    leaveRoom,
    updateMemberName,
    updateMemberIcon,
    sendRoomCommand,
    initIdentity,
    handleRoomPlayerPlaying,
  } = roomSync;

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
        isPlaying:
          overrides?.isPlaying ??
          (pendingResumeRef.current ? pendingResumeRef.current.autoPlay : s.isPlaying),
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
    onPlayerPlaying: (actualTime) => onPlayerPlayingRef.current(actualTime),
    onSaveSession: saveSession,
  });
  playerRef.current = player;

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

      recordHistory(track);

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
    [clock, player, recordHistory, saveSession, sendRoomCommand]
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
    playbackSignal,
    onPlay: handlePlayAction,
    onPause: handlePauseAction,
    onPrev: handlePrev,
    onNext: handleNext,
    onSeek: handleSeek,
  });

  useEffect(() => {
    let cancelled = false;
    requestPersistentStorage();
    initIdentity();

    const clientHint = getClientHint();

    async function boot() {
      const explorePromise = cachedFetchYouTubeExplore(undefined, clientHint);
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
      const storedPlsRaw = Array.isArray(storedPls) ? storedPls : [];
      // Playlist lama bisa punya id `pl_<timestamp>`; naikkan ke UUID sekali di sini
      // supaya seluruh URL setelah boot konsisten memakai UUID.
      const migrated = migratePlaylistIds(storedPlsRaw);
      if (migrated.playlists !== storedPlsRaw) {
        void writeStored("playlists", uid, migrated.playlists);
      }
      setPlaylistAliases(migrated.aliases);
      setLiked(parsedLiked);
      setHistory(parsedHistory);
      setCustomPlaylists(migrated.playlists);

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
          routeRef.current.path === ROUTES.home &&
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
      setHydrating(false);

      const needDur = [...parsedQueue, ...parsedHistory, ...parsedLiked].filter(
        (t) => t?.id && (!t.duration || t.duration === "—")
      );
      if (needDur.length) {
        hydrateTrackDurations(needDur, clientHint).then((filled) => {
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

      try {
        const data = await explorePromise;
        if (cancelled) return;
        setPlaylists(data.playlists);
        setActivePlaylistId(data.activePlaylistId);
        setHeroTitle(data.activeTitle);
        const resolvedTracks = data.tracks.length ? data.tracks : data.trending;
        setResults(resolvedTracks);
        setTrending(data.trending);
        setAlbums(data.albums);
        setArtists(data.artists);

        const nextQueue = resolveExploreFallbackQueue(
          queueRef.current,
          hasUserPlaybackRef.current || hadSavedQueue,
          resolvedTracks
        );
        if (nextQueue !== queueRef.current && nextQueue.length > 0) {
          queueRef.current = nextQueue;
          currentIndexRef.current = 0;
          activeTrackIdRef.current = nextQueue[0].id;
          setQueue(nextQueue);
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error("Failed to load explore data:", err);
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [clock, initIdentity]);

  useEffect(() => {
    saveSession();
  }, [queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, tab, saveSession]);

  const parsedTrackDur = currentTrack ? parseDurationSec(currentTrack.duration) : 0;
  const fallbackRoundDur = parsedTrackDur > 0 ? parsedTrackDur : 0;

  useEffect(() => {
    if (!currentTrack?.id) return;
    let cancelled = false;
    let reqSeq = 0;
    let fetchedDur = fallbackRoundDur || Math.round(clock.getSnapshot().duration) || 0;
    setLyrics(null);
    if (!roomRef.current) {
      setLyricVariantIdx(0);
      setLyricOffset(0);
    }

    const runFetch = (dur?: number) => {
      const mySeq = ++reqSeq;
      setLoadingLyrics(true);
      fetchTrackLyrics(currentTrack.title, currentTrack.channel, dur)
        .then((res) => {
          if (!cancelled && mySeq === reqSeq) setLyrics(res);
        })
        .finally(() => {
          if (!cancelled && mySeq === reqSeq) setLoadingLyrics(false);
        });
    };

    runFetch(fetchedDur || undefined);

    if (fetchedDur > 0) {
      return () => {
        cancelled = true;
      };
    }

    const unsub = clock.subscribe(() => {
      if (cancelled) return;
      const liveDur = Math.round(clock.getSnapshot().duration);
      if (liveDur > 0 && fetchedDur === 0) {
        fetchedDur = liveDur;
        unsub();
        runFetch(liveDur);
      }
    });

    return () => {
      cancelled = true;
      unsub();
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

  onPlayerPlayingRef.current = (actualTime: number) => {
    setPlaybackSignal((n) => n + 1);
    handleRoomPlayerPlaying(actualTime);
  };

  const cycleLyricVariant = useCallback(() => {
    const len = lyrics?.variants?.length || 0;
    const nextIdx = len > 1 ? (lyricVariantIdx + 1) % len : 0;
    setLyricVariantIdx(nextIdx);
    setLyricOffset(0);
    if (roomRef.current) {
      void sendRoomCommand({ type: "setLyrics", variantIdx: nextIdx, offset: 0 });
    }
  }, [lyrics?.variants?.length, lyricVariantIdx, sendRoomCommand]);

  const changeLyricOffset = useCallback(
    (nextOffset: number) => {
      const clean = Math.max(-30, Math.min(30, Math.round(nextOffset * 10) / 10));
      setLyricOffset(clean);
      if (roomRef.current) {
        void sendRoomCommand({ type: "setLyrics", offset: clean });
      }
    },
    [sendRoomCommand]
  );

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

  const openAlbumById = useCallback(
    async (albumId: string) => {
      if (!albumId) return;
      setSearching(true);
      setOpeningTarget("album");
      try {
        const data = await cachedFetchYouTubeAlbum(albumId);
        if (data) {
          setActiveAlbum(data);
        } else {
          toast.error("Failed to load album");
          // Link album rusak/tidak tersedia -> kembali ke daftar album.
          replaceRoute(tabToRoute("albums"));
        }
      } finally {
        setSearching(false);
        setOpeningTarget((cur) => (cur === "album" ? null : cur));
      }
    },
    [replaceRoute]
  );

  const openChannel = useCallback(
    async (target: Track | ArtistSummary | string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setNowPlayingOpen(false);
      setSearching(true);
      setOpeningTarget("artist");
      setActiveAlbum(null);
      setChannelInfo(null);
      setChannelTracks([]);
      setChannelCont(undefined);
      setTabState("artists");
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
          replaceRoute(tabToRoute("artists"));
          return;
        }
        const data = await cachedFetchYouTubeChannel(cid, undefined, knownName);
        if (!data) {
          toast.error("Failed to load artist tracks");
          // Link artis rusak/tidak tersedia -> kembali ke daftar artis.
          replaceRoute(tabToRoute("artists"));
          return;
        }
        setChannelInfo(data.channel);
        setChannelTracks(data.tracks);
        setChannelCont(data.continuation);
        if (data.channel.id) {
          navigate({
            tab: "artists",
            path: ROUTES.artist(data.channel.id),
            entityId: data.channel.id,
          });
        }
      } finally {
        setSearching(false);
        setOpeningTarget((cur) => (cur === "artist" ? null : cur));
      }
    },
    [navigate, replaceRoute]
  );

  // Deep link: /albums/[id] & /artists/[id] memuat datanya sendiri saat dibuka
  // langsung / di-refresh. Guard `openingTarget`/data aktif mencegah fetch ganda
  // saat navigasi dilakukan dari dalam app.
  useEffect(() => {
    const id = route.tab === "albums" ? route.entityId : undefined;
    if (!id || activeAlbum?.album.id === id || openingTarget === "album") return;
    void openAlbumById(id);
  }, [route.tab, route.entityId, activeAlbum?.album.id, openingTarget, openAlbumById]);

  useEffect(() => {
    const id = route.tab === "artists" ? route.entityId : undefined;
    if (!id || channelInfo?.id === id || openingTarget === "artist") return;
    void openChannel(id);
  }, [route.tab, route.entityId, channelInfo?.id, openingTarget, openChannel]);

  async function openAlbum(album: AlbumSummary) {
    if (!album.id) return;
    setSearching(true);
    setOpeningTarget("album");
    setActiveAlbum(null);
    setChannelInfo(null);
    navigate({ tab: "albums", path: ROUTES.album(album.id), entityId: album.id });
    try {
      const data = await cachedFetchYouTubeAlbum(album.id);
      if (!data) {
        toast.error("Failed to load album");
        replaceRoute(tabToRoute("albums"));
        return;
      }
      setActiveAlbum(data);
    } finally {
      setSearching(false);
      setOpeningTarget((cur) => (cur === "album" ? null : cur));
    }
  }

  async function loadMoreChannel() {
    if (!channelInfo?.id || !channelCont || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await cachedFetchYouTubeChannel(
        channelInfo.id,
        channelCont,
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
    setOpeningTarget(null);
    setActiveAlbum(null);
    setChannelInfo(null);
    navigate({ tab: "songs", path: ROUTES.songs });
    setActivePlaylistId(pl.id);
    setHeroTitle(pl.title);
    const clientHint = getClientHint();
    try {
      const data = await cachedFetchYouTubeExplore(pl.id, clientHint);
      if (data.tracks.length) setResults(data.tracks);
      else toast.error("Failed to load playlist");
      if (data.albums.length) setAlbums(data.albums);
      if (data.artists.length) setArtists(data.artists);
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
    setOpeningTarget(null);
    setActiveAlbum(null);
    setChannelInfo(null);
    navigate({ tab: "songs", path: `${ROUTES.search}?q=${encodeURIComponent(q)}`, query: q });
    setActivePlaylistId("");
    setHeroTitle(`Results: ${q}`);
    const clientHint = getClientHint();
    try {
      const res = await cachedSearchYouTubeMusic(q, clientHint);
      if (!res.tracks.length && !res.albums.length && !res.artists.length) {
        toast.error("No results found");
      } else {
        setResults(res.tracks);
        setAlbums(res.albums);
        setArtists(res.artists);
      }
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
    // Id = UUID sehingga URL tetap sama walau nama playlist diubah:
    // /library/playlist/9f1c2a3e-...
    const id = createPlaylistId();
    const created: CustomPlaylist = {
      id,
      name: trimmed,
      tracks: [],
    };
    saveCustomPlaylists([...customPlaylists, created]);
    setNewPlaylistName("");
    setNewPlaylistOpen(false);
    setActiveCustomPlId(created.id);
    navigate({ tab: "playlist", path: ROUTES.playlist(created.id), entityId: created.id });
    toast.success(`Created "${trimmed}"`);
  }

  // Buka modal dalam mode "buat baru" (dipakai sidebar/context menu/library).
  function openCreatePlaylist() {
    setPlaylistModalMode("create");
    setRenamePlaylistId("");
    setNewPlaylistName("");
    setNewPlaylistOpen(true);
  }

  // Buka modal dalam mode "ganti nama", input langsung berisi nama saat ini.
  function openRenamePlaylist(playlistId: string) {
    const target = customPlaylists.find((p) => p.id === playlistId);
    if (!target) return;
    setPlaylistModalMode("rename");
    setRenamePlaylistId(playlistId);
    setNewPlaylistName(target.name);
    setNewPlaylistOpen(true);
  }

  function renameCustomPlaylist(playlistId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const target = customPlaylists.find((p) => p.id === playlistId);
    if (!target) return;
    if (trimmed === target.name) {
      setNewPlaylistOpen(false);
      setNewPlaylistName("");
      return;
    }
    // Id berupa UUID, jadi rename hanya mengganti nama — URL playlist tetap.
    const next = customPlaylists.map((p) =>
      p.id === target.id ? { ...p, name: trimmed } : p
    );
    saveCustomPlaylists(next);
    setNewPlaylistOpen(false);
    setNewPlaylistName("");
    toast.success(`Renamed to "${trimmed}"`);
  }

  function addTrackToPlaylist(playlistId: string, track: Track) {
    const target = customPlaylists.find((p) => p.id === playlistId);
    if (!target) return;
    if (target.tracks.some((t) => t.id === track.id)) {
      return toast(`Already in "${target.name}"`);
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
      // Hapus = keluar dari detail playlist. Selalu kembali ke Library (bukan home),
      // supaya user langsung melihat daftar playlist yang tersisa.
      setActiveCustomPlId("");
      navigate(tabToRoute("library"));
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

  function clearHistory() {
    setHistory([]);
    void writeStored("history", userKeyRef.current, []);
    toast.success("History cleared");
  }

  function playAll(tracks: Track[]) {
    if (!tracks.length) return;
    queueRef.current = tracks;
    setQueue(tracks);
    playTrackAt(0, tracks);
  }

  function openTrackMenu(
    track: Track,
    e: React.MouseEvent,
    customPlaylistId?: string,
    playlistOnly = false
  ) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(window.innerWidth - 220, Math.max(12, rect.right - 208));
    const y = Math.min(window.innerHeight - 280, Math.max(12, rect.bottom + 6));
    setTrackMenu({ track, x, y, customPlaylistId, playlistOnly });
  }

  return {
    tab,
    setTab,
    route,
    navigate,
    syncRoute,
    openAlbumById,
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
    hydrating,
    openingTarget,
    setOpeningTarget,
    customPlaylists,
    playlistAliases,
    activeCustomPlId,
    setActiveCustomPlId,
    newPlaylistOpen,
    setNewPlaylistOpen,
    openCreatePlaylist,
    newPlaylistName,
    setNewPlaylistName,
    playlistModalMode,
    renamePlaylistId,
    openRenamePlaylist,
    renameCustomPlaylist,
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
    lyricOffset,
    cycleLyricVariant,
    changeLyricOffset,
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
    memberId,
    memberName,
    memberIcon,
    createRoom,
    joinRoom,
    leaveRoom,
    updateMemberName,
    updateMemberIcon,
    playTrackAt,
    playTrackNow,
    playAll,
    clearQueue,
    clearHistory,
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


