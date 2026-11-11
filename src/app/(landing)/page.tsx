"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Search,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  Heart,
  Loader2,
  Trash2,
  ArrowLeft,
  X,
  Home,
  Headphones,
  Disc3,
  Users,
  Clock,
  ListMusic,
  ListPlus,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Moon,
  Sun,
  Menu,
  Music,
} from "lucide-react";
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
} from "@/components/landing/hero";
import { TrackCover } from "@/components/landing/track-cover";
import { HomeDashboard } from "@/components/landing/home-dashboard";
import { toast } from "sonner";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface CustomPlaylist {
  id: string;
  name: string;
  tracks: Track[];
}

type TabId =
  | "home"
  | "songs"
  | "albums"
  | "artists"
  | "liked"
  | "history"
  | "queue"
  | "playlist";

function formatTime(sec: number): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`
    : `${m}:${s < 10 ? "0" : ""}${s}`;
}

function parseDurationSec(dur: string): number {
  const parts = dur.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export default function NgePlayPage() {
  const [tab, setTab] = useState<TabId>("home");
  const [dark, setDark] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const [trackMenu, setTrackMenu] = useState<{
    track: Track;
    x: number;
    y: number;
    customPlaylistId?: string;
  } | null>(null);

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
  const lyricsModalBoxRef = useRef<HTMLDivElement | null>(null);
  const activeModalLyricRef = useRef<HTMLButtonElement | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const hydratedRef = useRef(false);
  const userKeyRef = useRef("guest");
  const pendingResumeRef = useRef<{ videoId: string; seekTo: number; autoPlay: boolean } | null>(null);
  const stateRef = useRef({
    queue,
    currentIndex,
    currentTime,
    isPlaying,
    volume,
    muted,
    repeat,
    shuffle,
    tab,
  });

  useEffect(() => {
    stateRef.current = {
      queue,
      currentIndex,
      currentTime,
      isPlaying,
      volume,
      muted,
      repeat,
      shuffle,
      tab,
    };
  }, [queue, currentIndex, currentTime, isPlaying, volume, muted, repeat, shuffle, tab]);

  function skey(base: string, uid = userKeyRef.current) {
    return `ngeplay_${base}_${uid}`;
  }

  function saveSession(overrideTime?: number, overridePlaying?: boolean) {
    if (!hydratedRef.current) return;
    try {
      const s = stateRef.current;
      if (!s.queue.length) return;
      localStorage.setItem(
        skey("session"),
        JSON.stringify({
          queue: s.queue.slice(0, 60),
          currentIndex: s.currentIndex,
          currentTime: overrideTime ?? s.currentTime,
          isPlaying: overridePlaying ?? s.isPlaying,
          volume: s.volume,
          muted: s.muted,
          repeat: s.repeat,
          shuffle: s.shuffle,
          tab: s.tab === "playlist" ? "home" : s.tab,
        })
      );
    } catch {}
  }

  function hydrateForUser(uid: string) {
    userKeyRef.current = uid;
    pendingResumeRef.current = null;
    let hasSavedQueue = false;
    const read = (base: string) =>
      localStorage.getItem(skey(base, uid)) ||
      (uid === "guest" ? localStorage.getItem(`ngeplay_${base}`) : null);

    try {
      const l = read("liked");
      const h = read("history");
      const pls = read("playlists");
      const rawSession = read("session");
      const parsedLiked: Track[] = l ? JSON.parse(l) : [];
      const parsedHistory: Track[] = h ? JSON.parse(h) : [];
      setLiked(parsedLiked);
      setHistory(parsedHistory);
      setCustomPlaylists(pls ? JSON.parse(pls) : []);
      let parsedQueue: Track[] = [];
      if (rawSession) {
        const s = JSON.parse(rawSession);
        if (Array.isArray(s.queue) && s.queue.length > 0) {
          hasSavedQueue = true;
          parsedQueue = s.queue;
          const idx = Math.min(Math.max(0, Number(s.currentIndex) || 0), s.queue.length - 1);
          setQueue(s.queue);
          setCurrentIndex(idx);
          setCurrentTime(Number(s.currentTime) || 0);
          if (typeof s.volume === "number") setVolume(s.volume);
          if (typeof s.muted === "boolean") setMuted(s.muted);
          if (typeof s.repeat === "boolean") setRepeat(s.repeat);
          if (typeof s.shuffle === "boolean") setShuffle(s.shuffle);
          if (["home", "songs", "albums", "artists", "liked", "history", "queue"].includes(s.tab)) {
            setTab(s.tab);
          }
          pendingResumeRef.current = {
            videoId: s.queue[idx].id,
            seekTo: Number(s.currentTime) || 0,
            autoPlay: Boolean(s.isPlaying),
          };
        }
      }
      const needDur = [...parsedQueue, ...parsedHistory, ...parsedLiked].filter(
        (t) => t?.id && (!t.duration || t.duration === "—")
      );
      if (needDur.length) {
        hydrateTrackDurations(needDur).then((filled) => {
          const map = new Map(filled.map((t) => [t.id, t.duration]));
          const patch = (list: Track[]) =>
            list.map((t) =>
              (!t.duration || t.duration === "—") && map.get(t.id)
                ? { ...t, duration: map.get(t.id)! }
                : t
            );
          setQueue((q) => patch(q));
          setHistory((prev) => patch(prev));
          setLiked((prev) => patch(prev));
        });
      }
    } catch {}
    return hasSavedQueue;
  }

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    let cancelled = false;
    const hadQueue = hydrateForUser("guest");
    hydratedRef.current = true;

    fetchYouTubeExplore().then((data) => {
      if (cancelled) return;
      setPlaylists(data.playlists);
      setActivePlaylistId(data.activePlaylistId);
      setHeroTitle(data.activeTitle);
      setResults(data.tracks);
      setTrending(data.trending);
      setAlbums(data.albums);
      setArtists(data.artists);
      if (!hadQueue && data.tracks.length > 0) {
        setQueue(data.tracks);
      }
      setSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentTrack = queue[currentIndex] || results[0];

  useEffect(() => {
    const trackId = currentTrack?.id;
    if (!trackId || playerRef.current) return;

    const resume = pendingResumeRef.current;
    const startSec = resume && resume.videoId === trackId ? Math.floor(resume.seekTo) : 0;

    const init = () => {
      if (playerRef.current || !window.YT?.Player) return;
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
            const s = stateRef.current;
            if (s.muted) e.target.mute();
            else e.target.setVolume(s.volume);
            setDuration(e.target.getDuration() || 0);

            if (pendingResumeRef.current) {
              const { seekTo, autoPlay } = pendingResumeRef.current;
              pendingResumeRef.current = null;
              if (seekTo > 1) e.target.seekTo(seekTo, true);
              if (autoPlay) {
                e.target.playVideo();
                setTimeout(() => {
                  const st = e.target.getPlayerState?.();
                  if (st !== 1 && st !== 3) {
                    toast.info(`Click anywhere to resume from ${formatTime(seekTo)}`);
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
            if (e.data === S.PLAYING) {
              setIsPlaying(true);
              setDuration(e.target.getDuration() || 0);
            } else if (e.data === S.PAUSED) {
              setIsPlaying(false);
              saveSession(e.target.getCurrentTime?.() || 0, false);
            } else if (e.data === S.ENDED) {
              const { queue: q, currentIndex: i, repeat: r, shuffle: s } = stateRef.current;
              if (r) {
                e.target.seekTo(0);
                e.target.playVideo();
              } else if (q.length > 0) {
                playTrackAt(s ? Math.floor(Math.random() * q.length) : (i + 1) % q.length, q);
              }
            }
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
  }, [currentTrack?.id]);

  useEffect(() => {
    saveSession();
  }, [queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, tab]);

  useEffect(() => {
    const flush = () => {
      const liveTime = readyRef.current
        ? playerRef.current?.getCurrentTime?.() || stateRef.current.currentTime
        : stateRef.current.currentTime;
      saveSession(liveTime, stateRef.current.isPlaying);
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let lastMs = Date.now();
    let accSec = 0;
    let lastRawYt = -1;
    let syncYtSec = playerRef.current?.getCurrentTime?.() || 0;
    let syncPerfMs = performance.now();

    const t = setInterval(() => {
      if (!readyRef.current || !playerRef.current?.getCurrentTime) return;
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
        if (Math.abs(sec - raw) > 0.35) {
          sec = Math.min(sec, raw + 0.35);
        }
      }
      if (d > 0) {
        sec = Math.min(sec, d);
        setDuration(d);
      }
      setCurrentTime(Math.max(0, sec));

      const now = Date.now();
      const delta = Math.min(2, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      accSec += delta;

      if (accSec >= 1) {
        const whole = Math.floor(accSec);
        accSec -= whole;
        saveSession(raw, true);
      }
    }, 80);

    return () => clearInterval(t);
  }, [isPlaying]);

  const parsedTrackDur = currentTrack ? parseDurationSec(currentTrack.duration) : 0;
  const lyricsDurKey = parsedTrackDur > 0 ? parsedTrackDur : Math.round(duration);

  useEffect(() => {
    if (!currentTrack?.id) return;
    let cancelled = false;
    setLoadingLyrics(true);
    setLyrics(null);
    setLyricVariantIdx(0);
    fetchTrackLyrics(currentTrack.title, currentTrack.channel, lyricsDurKey || undefined)
      .then((res) => {
        if (!cancelled) setLyrics(res);
      })
      .finally(() => {
        if (!cancelled) setLoadingLyrics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, parsedTrackDur === 0 && duration > 0 ? Math.round(duration) : parsedTrackDur]);

  const LYRIC_LEAD_SEC = 0.45;
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
    if (nowPlayingOpen && nowPlayingTab === "lyrics" && box && el) {
      box.scrollTo({
        top: Math.max(0, el.offsetTop - box.clientHeight * 0.38),
        behavior: "smooth",
      });
    }
  }, [activeLyricIndex, nowPlayingOpen, nowPlayingTab]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNowPlayingOpen(false);
        setMobileMenuOpen(false);
        setMobileVolOpen(false);
        setNewPlaylistOpen(false);
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

  function playTrackAt(index: number, list = queue) {
    const track = list[index];
    if (!track) return;
    setCurrentIndex(index);
    setCurrentTime(0);
    setHistory((prev) => {
      const next = [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 30);
      localStorage.setItem(skey("history"), JSON.stringify(next));
      return next;
    });
    if (readyRef.current && playerRef.current?.loadVideoById) {
      playerRef.current.loadVideoById(track.id);
      setIsPlaying(true);
    } else {
      pendingResumeRef.current = { videoId: track.id, seekTo: 0, autoPlay: true };
    }
  }

  function playTrackNow(track: Track, sourceList?: Track[]) {
    const base = sourceList?.length ? sourceList : queue;
    const idx = base.findIndex((t) => t.id === track.id);
    if (idx !== -1) {
      setQueue(base);
      playTrackAt(idx, base);
    } else {
      const next = [track, ...base];
      setQueue(next);
      playTrackAt(0, next);
    }
  }

  function togglePlay() {
    if (!readyRef.current || !playerRef.current) return;
    isPlaying ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
  }

  function handleNext() {
    if (!queue.length) return;
    playTrackAt(shuffle ? Math.floor(Math.random() * queue.length) : (currentIndex + 1) % queue.length);
  }

  function handlePrev() {
    if (!queue.length) return;
    if (currentTime > 4 && playerRef.current?.seekTo) return playerRef.current.seekTo(0);
    playTrackAt((currentIndex - 1 + queue.length) % queue.length);
  }

  function handleSeek(val: number) {
    setCurrentTime(val);
    if (readyRef.current && playerRef.current?.seekTo) playerRef.current.seekTo(val, true);
    saveSession(val);
  }

  function handleVolume(val: number) {
    setVolume(val);
    setMuted(val === 0);
    if (readyRef.current && playerRef.current?.setVolume) {
      playerRef.current.unMute?.();
      playerRef.current.setVolume(val);
    }
  }

  function toggleMute() {
    if (!readyRef.current || !playerRef.current) return;
    if (muted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 80);
      setMuted(false);
    } else {
      playerRef.current.mute();
      setMuted(true);
    }
  }

  function toggleLike(track: Track, e?: React.MouseEvent) {
    e?.stopPropagation();
    setLiked((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      const next = exists ? prev.filter((t) => t.id !== track.id) : [track, ...prev];
      localStorage.setItem(skey("liked"), JSON.stringify(next));
      return next;
    });
  }

  async function openChannel(
    target: Track | ArtistSummary | string,
    e?: React.MouseEvent
  ) {
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
    try {
      localStorage.setItem(skey("playlists"), JSON.stringify(next));
    } catch {}
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
    if (activeCustomPlId === playlistId) setTab("home");
    toast.success("Playlist deleted");
  }

  function openTrackMenu(track: Track, e: React.MouseEvent, customPlaylistId?: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(window.innerWidth - 220, Math.max(12, rect.right - 208));
    const y = Math.min(window.innerHeight - 280, Math.max(12, rect.bottom + 6));
    setTrackMenu({ track, x, y, customPlaylistId });
  }

  const activeCustomPlaylist = customPlaylists.find((p) => p.id === activeCustomPlId);
  const isCurrentLiked = liked.some((t) => t.id === currentTrack?.id);
  const displayedTracks =
    tab === "artists" && channelInfo
      ? channelTracks
      : tab === "albums" && activeAlbum
      ? activeAlbum.tracks
      : tab === "songs"
      ? results
      : tab === "queue"
      ? queue
      : tab === "liked"
      ? liked
      : tab === "history"
      ? history
      : tab === "playlist"
      ? activeCustomPlaylist?.tracks || []
      : results;

  const recentTracks = (() => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    for (const t of [...history, ...results]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
      if (merged.length >= 12) break;
    }
    return merged;
  })();

  const totalSec = displayedTracks.reduce((acc, t) => acc + parseDurationSec(t.duration), 0);
  const heroCover =
    (tab === "artists" && channelInfo?.avatar) ||
    (tab === "albums" && activeAlbum?.album.thumbnail) ||
    displayedTracks[0]?.thumbnail ||
    currentTrack?.thumbnail;
  const sectionTitle =
    tab === "artists" && channelInfo
      ? channelInfo.title
      : tab === "albums" && activeAlbum
      ? activeAlbum.album.title
      : tab === "songs"
      ? heroTitle
      : tab === "queue"
      ? "Play Queue"
      : tab === "liked"
      ? "Liked Songs"
      : tab === "history"
      ? "History"
      : tab === "playlist"
      ? activeCustomPlaylist?.name || "Playlist"
      : "Discover";

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volPct = muted ? 0 : volume;

  function toggleDarkMode() {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("ngeplay_theme", next ? "dark" : "light");
      } catch {}
      return next;
    });
  }

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7] flex flex-col select-none">
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-md border-b border-black/[0.04] dark:border-white/[0.06] px-4 sm:px-8 py-4 flex items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2 lg:w-[200px] shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menu"
              className="lg:hidden p-2 -ml-1 rounded-full text-[#4B5563] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#1A1D26] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setTab("home");
                setActiveAlbum(null);
                setChannelInfo(null);
              }}
              className="flex items-center gap-2.5 cursor-pointer group shrink-0"
            >
              <svg className="w-7 h-7 shrink-0 drop-shadow-[0_4px_10px_rgba(255,208,20,0.45)]" viewBox="0 0 32 32" fill="none">
                <path
                  d="M7 6.8C7 4.45 9.62 3.05 11.58 4.35L25.4 13.55C27.15 14.71 27.15 17.29 25.4 18.45L11.58 27.65C9.62 28.95 7 27.55 7 25.2V6.8Z"
                  fill="#FFD014"
                />
              </svg>
              <span className="font-extrabold text-[17px] tracking-tight text-[#18181B] dark:text-white">
                Nge-Play
              </span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
            className="relative flex-1 max-w-xl"
          >
            <Search className="w-4 h-4 text-[#B0B7C3] dark:text-[#6B7280] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for songs, artists, albums, etc..."
              className="w-full h-10 bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#EFEFF2] dark:hover:bg-[#1B1F2A] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014]/70 rounded-full pl-11 pr-9 text-xs sm:text-[13px] text-[#18181B] dark:text-[#F4F5F7] placeholder:text-[#9CA3AF] dark:placeholder:text-[#6B7280] focus:outline-none transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  if (!activePlaylistId && playlists[0]) handleSelectPlaylist(playlists[0]);
                }}
                title="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <button
            onClick={toggleDarkMode}
            title={dark ? "Light Mode" : "Dark Mode"}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="w-10 h-10 rounded-full bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#FFF9DB] dark:hover:bg-[#222632] border border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#FFD014] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <div className="flex-1 flex min-w-0">
          <aside className="hidden lg:flex w-[228px] shrink-0 flex-col py-5 px-5 sticky top-[72px] self-start max-h-[calc(100vh-156px)] overflow-y-auto">
            <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3.5 mb-2.5">
              Music
            </p>
            <nav className="space-y-1">
              {[
                { id: "home", label: "Home", icon: Home },
                { id: "songs", label: "Songs", icon: Headphones },
                { id: "albums", label: "Albums", icon: Disc3 },
                { id: "artists", label: "Artists", icon: Users },
                { id: "liked", label: "Liked", icon: Heart, badge: liked.length || undefined },
                { id: "history", label: "History", icon: Clock },
              ].map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTab(item.id as TabId);
                      if (item.id === "albums") setActiveAlbum(null);
                      if (item.id === "artists") setChannelInfo(null);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-[13px] transition-all cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-[#FFCE00] to-[#FFD93B] text-[#18181B] font-bold shadow-[0_8px_20px_rgba(255,206,0,0.28)]"
                        : "text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F7F8FA] dark:hover:bg-[#161922] font-medium"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge ? (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          active
                            ? "bg-black/10 text-[#18181B]"
                            : "bg-[#F3F4F6] dark:bg-[#1E222D] text-[#6B7280] dark:text-[#9CA3AF]"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3.5 mt-7 mb-2.5">
              Playlists
            </p>
            <div className="space-y-1">
              {customPlaylists.map((pl) => {
                const active = tab === "playlist" && activeCustomPlId === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => {
                      setActiveCustomPlId(pl.id);
                      setTab("playlist");
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2 rounded-full text-[13px] transition-colors cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-[#FFCE00] to-[#FFD93B] text-[#18181B] font-bold shadow-[0_8px_20px_rgba(255,206,0,0.28)]"
                        : "text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F7F8FA] dark:hover:bg-[#161922] font-medium"
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <ListMusic className="w-4 h-4 shrink-0" />
                      <span className="truncate">{pl.name}</span>
                    </span>
                    <span className="text-[10px] opacity-60 shrink-0">{pl.tracks.length}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setNewPlaylistOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-full text-[13px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F7F8FA] dark:hover:bg-[#161922] transition-colors cursor-pointer"
              >
                <ListPlus className="w-4 h-4 shrink-0" />
                <span>New Playlist</span>
              </button>
            </div>
          </aside>
          <main className="flex-1 min-w-0 px-5 sm:px-8 pt-6 pb-36 lg:pb-24 flex flex-col">
            {tab === "home" ? (
              <HomeDashboard
                loading={searching}
                albums={albums}
                trending={trending}
                recentTracks={recentTracks}
                artists={artists}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlayTrack={playTrackNow}
                onTogglePlay={togglePlay}
                onOpenAlbum={openAlbum}
                onOpenArtist={openChannel}
                onOpenMenu={openTrackMenu}
                onSeeAllSongs={() => setTab("songs")}
                onSeeAllAlbums={() => {
                  setActiveAlbum(null);
                  setTab("albums");
                }}
                onSeeAllArtists={() => {
                  setChannelInfo(null);
                  setTab("artists");
                }}
              />
            ) : tab === "albums" && !activeAlbum ? (
              <div className="space-y-4">
                <h1 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
                  Albums
                </h1>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                  {albums.map((alb) => (
                    <div
                      key={alb.id}
                      onClick={() => openAlbum(alb)}
                      className="group cursor-pointer min-w-0"
                    >
                      <div className="relative aspect-square rounded-[20px] overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:shadow-none dark:ring-1 dark:ring-white/[0.06] group-hover:shadow-[0_12px_26px_rgba(15,23,42,0.1)] transition-all">
                        <TrackCover src={alb.thumbnail} alt={alb.title} iconClass="w-7 h-7" lazy />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="w-10 h-10 rounded-full bg-[#FFD014] text-[#18181B] flex items-center justify-center shadow-md">
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </span>
                        </div>
                      </div>
                      <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate mt-2.5">
                        {alb.title}
                      </p>
                      <p className="text-xs text-[#9CA3AF] truncate">{alb.subtitle}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : tab === "artists" && !channelInfo ? (
              <div className="space-y-4">
                <h1 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
                  Popular Artists
                </h1>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                  {artists.map((art) => (
                    <div
                      key={art.id}
                      onClick={(e) => openChannel(art, e)}
                      className="p-4 rounded-[22px] bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#F1F3F6] dark:hover:bg-[#1B1F2A] border border-transparent dark:border-white/[0.05] transition-colors flex flex-col items-center text-center gap-3 cursor-pointer"
                    >
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-white dark:bg-[#1E222D] shadow-sm border border-black/[0.04] dark:border-white/[0.08]">
                        <TrackCover src={art.avatar} alt={art.name} iconClass="w-6 h-6" lazy />
                      </div>
                      <div className="min-w-0 w-full">
                        <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate">
                          {art.name}
                        </p>
                        <p className="text-xs text-[#9CA3AF] truncate mt-0.5">
                          {art.subscribers || "YouTube Music Artist"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <section className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {((tab === "albums" && activeAlbum) || (tab === "artists" && channelInfo)) && (
                      <button
                        onClick={() => {
                          setActiveAlbum(null);
                          setChannelInfo(null);
                        }}
                        title="Back"
                        className="p-2 rounded-full bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1E222D] text-[#18181B] dark:text-white transition-colors cursor-pointer shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    )}
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] border border-black/[0.05] dark:border-white/[0.08] shrink-0">
                      <TrackCover
                        src={heroCover}
                        trackId={
                          tab === "artists" && channelInfo?.avatar
                            ? undefined
                            : displayedTracks[0]?.id || currentTrack?.id
                        }
                        alt={sectionTitle}
                        iconClass="w-5 h-5"
                      />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#18181B] dark:text-white truncate">
                        {sectionTitle}
                      </h1>
                      <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 flex flex-wrap items-center gap-1.5 truncate">
                        {tab === "artists" && channelInfo ? (
                          <span>
                            {[channelInfo.handle, channelInfo.subscribers, channelInfo.videoCount]
                              .filter(Boolean)
                              .join(" · ") || "YouTube Music artist"}
                          </span>
                        ) : (
                          <>
                            <span>{displayedTracks.length} tracks</span>
                            {totalSec > 0 && (
                              <>
                                <span className="text-[#D1D5DB] dark:text-white/20">·</span>
                                <span>{formatTime(totalSec)}</span>
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {displayedTracks.length > 0 && (
                      <button
                        onClick={() => {
                          setQueue(displayedTracks);
                          playTrackAt(0, displayedTracks);
                        }}
                        className="bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] text-xs font-bold px-4 py-2 rounded-full shadow-[0_6px_16px_rgba(255,208,20,0.3)] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play All</span>
                      </button>
                    )}
                    {tab === "playlist" && activeCustomPlaylist && (
                      <button
                        onClick={() => deleteCustomPlaylist(activeCustomPlaylist.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-red-600 px-2.5 py-2 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                    {tab === "queue" && queue.length > 1 && currentTrack && (
                      <button
                        onClick={() => setQueue([currentTrack])}
                        className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-red-600 px-2.5 py-2 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear
                      </button>
                    )}
                  </div>
                </section>

                {tab === "songs" && playlists.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-3 shrink-0">
                    {playlists.map((pl) => {
                      const active = activePlaylistId === pl.id;
                      return (
                        <button
                          key={pl.id}
                          onClick={() => handleSelectPlaylist(pl)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors cursor-pointer ${
                            active
                              ? "bg-[#FFD014] text-[#18181B] border-[#FFD014] shadow-sm"
                              : "bg-[#F7F8FA] dark:bg-[#161922] text-[#6B7280] dark:text-[#9CA3AF] border-black/[0.04] dark:border-white/[0.06] hover:text-[#18181B] dark:hover:text-white"
                          }`}
                        >
                          {pl.title}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] gap-3 px-3 py-2 text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.06] shrink-0">
                  <span>Track</span>
                  <span className="hidden sm:block">Artist</span>
                  <span className="hidden md:block text-right">Plays</span>
                  <span className="hidden sm:block text-right">Time</span>
                  <span />
                </div>

                <div className="divide-y divide-[#F3F4F6] dark:divide-white/[0.05]">
                  {searching ? (
                    <div className="flex flex-col items-center justify-center py-20 text-[#6B7280] dark:text-[#9CA3AF] gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-[#FFD014]" />
                      <p className="text-xs font-medium">Loading music from YouTube Music...</p>
                    </div>
                  ) : displayedTracks.length === 0 ? (
                    <div className="text-center py-16 text-[#9CA3AF] dark:text-[#6B7280] text-xs">
                      No tracks in this list yet.
                    </div>
                  ) : (
                    displayedTracks.map((track) => {
                      const isCurrent = currentTrack?.id === track.id;
                      const isTrackLiked = liked.some((t) => t.id === track.id);
                      return (
                        <div
                          key={track.id}
                          onClick={() => playTrackNow(track, displayedTracks)}
                          className={`group grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] gap-3 items-center px-3 py-2.5 rounded-2xl transition-colors cursor-pointer ${
                            isCurrent
                              ? "bg-[#FFFBEB] dark:bg-[#FFD014]/15"
                              : "hover:bg-[#F7F8FA] dark:hover:bg-[#161922]"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shrink-0">
                              <TrackCover
                                src={track.thumbnail}
                                trackId={track.id}
                                alt={track.title}
                                iconClass="w-4 h-4"
                                lazy
                              />
                              <div
                                className={`absolute inset-0 bg-black/35 flex items-center justify-center transition-opacity ${
                                  isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                }`}
                              >
                                {isCurrent && isPlaying ? (
                                  <Pause className="w-3.5 h-3.5 text-[#FFD014] fill-[#FFD014]" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-[#FFD014] fill-[#FFD014] ml-0.5" />
                                )}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p
                                className={`text-[13px] font-semibold truncate ${
                                  isCurrent
                                    ? "text-[#B45309] dark:text-[#FFD014]"
                                    : "text-[#18181B] dark:text-[#F4F5F7]"
                                }`}
                              >
                                {track.title}
                              </p>
                              <button
                                onClick={(e) => openChannel(track, e)}
                                className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate sm:hidden text-left cursor-pointer"
                              >
                                {track.channel}
                              </button>
                            </div>
                          </div>

                          <button
                            onClick={(e) => openChannel(track, e)}
                            className="hidden sm:block text-xs text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate text-left transition-colors cursor-pointer"
                          >
                            {track.channel}
                          </button>
                          <p className="hidden md:block text-xs text-[#9CA3AF] dark:text-[#6B7280] text-right truncate tabular-nums">
                            {track.views || "—"}
                          </p>
                          <p className="hidden sm:block text-xs text-[#6B7280] dark:text-[#9CA3AF] text-right tabular-nums">
                            {track.duration}
                          </p>

                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={(e) => toggleLike(track, e)}
                              title="Like"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${
                                  isTrackLiked ? "fill-[#FFD014] text-[#FFD014]" : ""
                                }`}
                              />
                            </button>
                            <button
                              onClick={(e) =>
                                openTrackMenu(
                                  track,
                                  e,
                                  tab === "playlist" ? activeCustomPlId : undefined
                                )
                              }
                              title="More options"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {tab === "artists" && channelCont && (
                    <div className="py-4 flex justify-center">
                      <button
                        onClick={loadMoreChannel}
                        disabled={loadingMore}
                        className="px-4 py-2 rounded-full border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-[#161922] hover:bg-[#F7F8FA] dark:hover:bg-[#1B1F2A] text-xs font-semibold text-[#18181B] dark:text-white flex items-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFD014]" />}
                        <span>{loadingMore ? "Loading tracks..." : "Load More"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.45)]">
          {!nowPlayingOpen && (
            <nav className="lg:hidden flex items-center justify-around border-t border-black/[0.04] dark:border-white/[0.06] bg-[#FAFAFB] dark:bg-[#12151D] px-2 py-1.5">
          {[
            { id: "home", label: "Home", icon: Home },
            { id: "songs", label: "Songs", icon: Headphones },
            { id: "albums", label: "Albums", icon: Disc3 },
            { id: "artists", label: "Artists", icon: Users },
            { id: "liked", label: "Liked", icon: Heart },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setTab(item.id as TabId);
                  if (item.id === "albums") setActiveAlbum(null);
                  if (item.id === "artists") setChannelInfo(null);
                }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-semibold cursor-pointer ${
                  active
                    ? "text-[#18181B] bg-[#FFF3BF] dark:bg-[#FFD014] dark:text-[#18181B]"
                    : "text-[#9CA3AF] dark:text-[#6B7280]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
          )}

        <footer className="relative">
          <div className="relative w-full h-[3px] hover:h-1.5 bg-[#EFEFEF] dark:bg-white/[0.08] transition-all group cursor-pointer">
            <div
              className="h-full bg-[#FFD014] transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={duration || 100}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="absolute -top-2 inset-x-0 w-full h-5 opacity-0 cursor-pointer"
            />
          </div>

          <div className="px-4 sm:px-8 py-3 flex items-center justify-between gap-3 sm:gap-5">
            <div
              onClick={() => currentTrack && setNowPlayingOpen((o) => !o)}
              className={`flex items-center gap-3 min-w-0 flex-1 md:max-w-[34%] ${
                currentTrack ? "cursor-pointer group/track" : ""
              }`}
            >
              {currentTrack ? (
                <>
                  <TrackCover
                    src={currentTrack.thumbnail}
                    trackId={currentTrack.id}
                    alt={currentTrack.title}
                    className="w-11 h-11 rounded-xl object-cover border border-black/[0.05] dark:border-white/[0.08] shrink-0 group-hover/track:scale-[1.03] transition-transform"
                    iconClass="w-4 h-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#18181B] dark:text-white truncate">
                      {currentTrack.title}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openChannel(currentTrack, e);
                      }}
                      className="text-xs text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white truncate block text-left cursor-pointer"
                    >
                      {currentTrack.channel}
                    </button>
                  </div>
                  <span className="hidden xl:block text-[11px] font-medium text-[#9CA3AF] tabular-nums ml-2 shrink-0">
                    {formatTime(currentTime)} - {formatTime(duration)}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
                  <div className="w-11 h-11 rounded-xl bg-[#F4F5F7] dark:bg-[#161922] flex items-center justify-center">
                    <Music className="w-4 h-4" />
                  </div>
                  <span>Select a song to play</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <button
                onClick={() => setRepeat((r) => !r)}
                title="Repeat"
                className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
                  repeat
                    ? "text-[#B45309] dark:text-[#FFD014] bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                    : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                }`}
              >
                <Repeat className="w-4 h-4" />
              </button>
              <button
                onClick={handlePrev}
                title="Previous"
                className="inline-flex p-1.5 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                title={isPlaying ? "Pause" : "Play"}
                className="w-10 h-10 rounded-full bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] flex items-center justify-center shadow-[0_6px_16px_rgba(255,208,20,0.4)] transition-transform active:scale-95 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={handleNext}
                title="Next"
                className="p-1.5 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => setShuffle((s) => !s)}
                title="Shuffle"
                className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
                  shuffle
                    ? "text-[#B45309] dark:text-[#FFD014] bg-[#FFF9DB] dark:bg-[#FFD014]/15"
                    : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 md:flex-1 md:max-w-[32%] shrink-0">
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="relative flex items-center group/vol"
              >
                {mobileVolOpen && (
                  <div className="md:hidden absolute right-0 bottom-11 bg-white dark:bg-[#161922] rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.08] px-3 py-2.5 flex items-center gap-2.5 z-50">
                    <button
                      onClick={toggleMute}
                      title={muted ? "Unmute" : "Mute"}
                      className="p-1 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer shrink-0"
                    >
                      {muted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-[#B45309] dark:text-[#FFD014]" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <div className="relative w-24 h-1.5 bg-[#EAECEF] dark:bg-white/15 rounded-full flex items-center">
                      <div
                        className="h-full bg-[#FFD014] rounded-full"
                        style={{ width: `${volPct}%` }}
                      />
                      <span
                        className="w-3 h-3 rounded-full bg-[#FFD014] shadow-sm absolute -translate-x-1/2 pointer-events-none"
                        style={{ left: `${volPct}%` }}
                      />
                      <input
                        type="range"
                        aria-label="Volume"
                        min={0}
                        max={100}
                        value={volPct}
                        onChange={(e) => handleVolume(Number(e.target.value))}
                        className="absolute -inset-y-2 inset-x-0 w-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                <div className="hidden md:flex w-0 opacity-0 pointer-events-none overflow-hidden group-hover/vol:overflow-visible group-hover/vol:w-24 group-hover/vol:opacity-100 group-hover/vol:pointer-events-auto group-hover/vol:mr-2 group-hover/vol:px-1.5 focus-within:overflow-visible focus-within:w-24 focus-within:opacity-100 focus-within:pointer-events-auto focus-within:mr-2 focus-within:px-1.5 transition-all duration-200 items-center h-5">
                  <div className="relative w-full h-1 bg-[#EAECEF] dark:bg-white/15 rounded-full flex items-center">
                    <div
                      className="h-full bg-[#FFD014] rounded-full"
                      style={{ width: `${volPct}%` }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-[#FFD014] shadow-sm absolute -translate-x-1/2 pointer-events-none"
                      style={{ left: `${volPct}%` }}
                    />
                    <input
                      type="range"
                      aria-label="Volume"
                      min={0}
                      max={100}
                      value={volPct}
                      onChange={(e) => handleVolume(Number(e.target.value))}
                      className="absolute -inset-y-2 inset-x-0 w-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.matchMedia("(min-width: 768px)").matches) {
                      toggleMute();
                    } else {
                      setMobileVolOpen((v) => !v);
                    }
                  }}
                  title={muted ? "Unmute" : "Volume"}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    mobileVolOpen
                      ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 text-[#B45309] dark:text-[#FFD014] md:bg-transparent md:text-[#9CA3AF]"
                      : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                  }`}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-[#B45309] dark:text-[#FFD014]" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {currentTrack && (
                <button
                  onClick={() => toggleLike(currentTrack)}
                  title="Like"
                  className="hidden sm:inline-flex p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      isCurrentLiked ? "fill-[#FFD014] text-[#FFD014]" : ""
                    }`}
                  />
                </button>
              )}

              {currentTrack && (
                <button
                  onClick={() => setNowPlayingOpen((o) => !o)}
                  title={nowPlayingOpen ? "Close player" : "Open player"}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    nowPlayingOpen
                      ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 text-[#B45309] dark:text-[#FFD014]"
                      : "text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                  }`}
                >
                  <ChevronUp
                    className={`w-4 h-4 transition-transform duration-200 ${
                      nowPlayingOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>


      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-68 max-w-[82vw] h-full bg-white dark:bg-[#0D0F14] border-r border-black/[0.06] dark:border-white/[0.08] p-5 flex flex-col overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.05] dark:border-white/[0.06]">
              <span className="font-extrabold text-base text-[#18181B] dark:text-white">
                Nge-Play
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-full text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#161922] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3 mt-5 mb-2">
              Library
            </p>
            <button
              onClick={() => {
                setTab("history");
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[13px] cursor-pointer ${
                tab === "history"
                  ? "bg-[#FFD014] text-[#18181B] font-bold"
                  : "text-[#4B5563] dark:text-[#9CA3AF] hover:bg-[#F7F8FA] dark:hover:bg-[#161922] font-medium"
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>History</span>
            </button>
            <p className="text-[11px] font-bold tracking-wider text-[#B0B7C3] dark:text-[#6B7280] px-3 mt-5 mb-2">
              Playlists
            </p>
            <div className="space-y-1">
              {customPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => {
                    setActiveCustomPlId(pl.id);
                    setTab("playlist");
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2 rounded-full text-[13px] cursor-pointer ${
                    tab === "playlist" && activeCustomPlId === pl.id
                      ? "bg-[#FFD014] text-[#18181B] font-bold"
                      : "text-[#4B5563] dark:text-[#9CA3AF] hover:bg-[#F7F8FA] dark:hover:bg-[#161922] font-medium"
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <ListMusic className="w-4 h-4 shrink-0" />
                    <span className="truncate">{pl.name}</span>
                  </span>
                  <span className="text-[10px] opacity-60 shrink-0">{pl.tracks.length}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setNewPlaylistOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-full text-[13px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:bg-[#F7F8FA] dark:hover:bg-[#161922] cursor-pointer"
              >
                <ListPlus className="w-4 h-4 shrink-0" />
                <span>New Playlist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {trackMenu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: `${trackMenu.x}px`, top: `${trackMenu.y}px` }}
          className="fixed z-50 w-52 bg-white dark:bg-[#161922] rounded-2xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] py-1.5 text-xs"
        >
          <button
            onClick={() => {
              playTrackNow(trackMenu.track);
              setTrackMenu(null);
            }}
            className="w-full px-3.5 py-2 text-left font-medium text-[#18181B] dark:text-[#F4F5F7] hover:bg-[#F7F8FA] dark:hover:bg-[#1E222D] cursor-pointer"
          >
            Play now
          </button>
          <button
            onClick={() => {
              toggleLike(trackMenu.track);
              setTrackMenu(null);
            }}
            className="w-full px-3.5 py-2 text-left font-medium text-[#18181B] dark:text-[#F4F5F7] hover:bg-[#F7F8FA] dark:hover:bg-[#1E222D] cursor-pointer"
          >
            {liked.some((t) => t.id === trackMenu.track.id) ? "Remove from Liked" : "Add to Liked"}
          </button>
          <button
            onClick={(e) => {
              openChannel(trackMenu.track, e);
              setTrackMenu(null);
            }}
            className="w-full px-3.5 py-2 text-left font-medium text-[#18181B] dark:text-[#F4F5F7] hover:bg-[#F7F8FA] dark:hover:bg-[#1E222D] cursor-pointer"
          >
            Open artist
          </button>
          {trackMenu.customPlaylistId && (
            <button
              onClick={() => {
                removeTrackFromPlaylist(trackMenu.customPlaylistId!, trackMenu.track.id);
                setTrackMenu(null);
              }}
              className="w-full px-3.5 py-2 text-left font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
            >
              Remove from playlist
            </button>
          )}
          {customPlaylists.length > 0 && (
            <div className="border-t border-black/[0.05] dark:border-white/[0.07] mt-1 pt-1">
              <p className="px-3.5 py-1 text-[11px] font-semibold text-[#9CA3AF]">
                Add to playlist
              </p>
              {customPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => {
                    addTrackToPlaylist(pl.id, trackMenu.track);
                    setTrackMenu(null);
                  }}
                  className="w-full px-3.5 py-1.5 text-left text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 truncate cursor-pointer"
                >
                  {pl.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {newPlaylistOpen && (
        <div
          onClick={() => setNewPlaylistOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              createCustomPlaylist(newPlaylistName);
            }}
            className="w-full max-w-sm bg-white dark:bg-[#161922] rounded-3xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#18181B] dark:text-white">New Playlist</h3>
              <button
                type="button"
                onClick={() => setNewPlaylistOpen(false)}
                className="p-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name..."
              className="w-full h-10 px-4 rounded-full bg-[#F4F5F7] dark:bg-[#0D0F14] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014] text-sm text-[#18181B] dark:text-white focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewPlaylistOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#1E222D] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full text-xs font-bold bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] cursor-pointer"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="fixed right-3 bottom-20 opacity-0 pointer-events-none w-[320px] h-[180px]">
        <div id="yt-audio-player" />
      </div>


      {nowPlayingOpen && currentTrack && (
        <div className="fixed inset-0 z-30 bg-white dark:bg-[#0D0F14] flex flex-col pb-[72px]">
          <div className="flex items-center justify-between px-5 sm:px-10 py-4 border-b border-black/[0.04] dark:border-white/[0.06] shrink-0">
            <span className="text-xs font-bold tracking-wide text-[#9CA3AF]">
              Now Playing
            </span>
            <button
              onClick={() => setNowPlayingOpen(false)}
              title="Minimize player"
              className="p-2 rounded-full bg-[#F4F5F7] dark:bg-[#161922] hover:bg-[#FFF9DB] dark:hover:bg-[#1E222D] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 lg:gap-12 px-5 sm:px-10 py-6 overflow-y-auto lg:overflow-hidden">
            <div className="flex flex-col items-center justify-center text-center lg:py-4 shrink-0">
              <div className="w-52 h-52 sm:w-72 sm:h-72 lg:w-full lg:max-w-[380px] aspect-square rounded-[28px] overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55)] border border-black/[0.04] dark:border-white/[0.08]">
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
                  openChannel(currentTrack, e);
                  setNowPlayingOpen(false);
                }}
                className="text-sm font-medium text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white mt-1 cursor-pointer"
              >
                {currentTrack.channel}
              </button>
              <div className="flex items-center gap-2.5 mt-4">
                <button
                  onClick={() => toggleLike(currentTrack)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    isCurrentLiked
                      ? "bg-[#FFF9DB] dark:bg-[#FFD014]/15 border-[#FFD014] text-[#B45309] dark:text-[#FFD014]"
                      : "bg-[#F7F8FA] dark:bg-[#161922] border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white"
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isCurrentLiked ? "fill-[#FFD014] text-[#FFD014]" : ""}`} />
                  <span>{isCurrentLiked ? "Liked" : "Like"}</span>
                </button>
                <button
                  onClick={(e) => openTrackMenu(currentTrack, e)}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#EAECEF] dark:hover:bg-[#1E222D] border border-black/[0.04] dark:border-white/[0.08] text-[#4B5563] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
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
                        onClick={() => setNowPlayingTab(t.id as "upnext" | "lyrics" | "related")}
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
                    onClick={() => setLyricVariantIdx((i) => (i + 1) % lyrics.variants!.length)}
                    title="Switch lyric timing version"
                    className="mb-2 px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#161922] text-[#B45309] dark:text-[#FFD014] hover:bg-[#FFF9DB] dark:hover:bg-[#FFD014]/15 text-[11px] font-semibold cursor-pointer tabular-nums"
                  >
                    v{lyricVariantIdx + 1}/{lyrics.variants.length}
                  </button>
                ) : null}
              </div>

              {nowPlayingTab === "upnext" ? (
                <div className="flex-1 min-h-0 overflow-y-auto pt-3 space-y-1 pr-1">
                  {queue.length === 0 ? (
                    <p className="text-sm text-[#9CA3AF] text-center py-16">Queue is empty.</p>
                  ) : (
                    queue.map((item, idx) => {
                      const isCur = idx === currentIndex;
                      return (
                        <div
                          key={`${item.id}-${idx}`}
                          onClick={() => playTrackAt(idx, queue)}
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
                            onClick={(e) => openTrackMenu(item, e)}
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
                  ref={lyricsModalBoxRef}
                  translate="no"
                  className="notranslate relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-5 space-y-1.5 pr-1"
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
                          onClick={() => handleSeek(Math.max(0, line.time))}
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
                <div className="flex-1 min-h-0 overflow-y-auto pt-3 space-y-1 pr-1">
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
                          onClick={() => playTrackNow(item, relatedTracks)}
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
                            onClick={(e) => openTrackMenu(item, e)}
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
      )}
    </div>
  );
}

