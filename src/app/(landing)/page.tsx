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
  Plus,
  Tv,
  Trash2,
  LogOut,
  ArrowLeft,
  X,
  Music,
} from "lucide-react";
import {
  fetchTrackLyrics,
  fetchYouTubeChannel,
  fetchYouTubeExplore,
  resolveChannelFromVideo,
  searchYouTube,
  type ChannelInfo,
  type LyricsResult,
  type Track,
  type YouTubePlaylist,
} from "@/components/landing/hero";
import { toast } from "sonner";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface AuthUser {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

type ActivityMap = Record<string, number>;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekBars(activity: ActivityMap) {
  const today = new Date();
  const todayKey = getDayKey(today);
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const key = getDayKey(dt);
    const sec = Math.max(0, Math.floor(activity[key] || 0));
    bars.push({
      key,
      label: DAY_LABELS[dt.getDay()],
      sec,
      mins: Math.floor(sec / 60),
      isToday: key === todayKey,
    });
  }
  return bars;
}

function formatActivityLive(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

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

function TrackCover({
  src,
  trackId,
  alt,
  className = "w-full h-full object-cover",
  iconClass = "w-4 h-4",
  lazy = false,
}: {
  src?: string;
  trackId?: string;
  alt: string;
  className?: string;
  iconClass?: string;
  lazy?: boolean;
}) {
  const fallback = trackId ? `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg` : "";
  const [imgSrc, setImgSrc] = useState(src || fallback);

  useEffect(() => {
    setImgSrc(src || fallback);
  }, [src, fallback]);

  if (!imgSrc) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#F3F5F9] text-[#9CA3AF]`}>
        <Music className={iconClass} />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      loading={lazy ? "lazy" : undefined}
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        const img = e.currentTarget;
        if (imgSrc === fallback && img.naturalWidth === 120 && img.naturalHeight === 90) {
          setImgSrc("");
        }
      }}
      onError={() => {
        if (fallback && imgSrc !== fallback) setImgSrc(fallback);
        else setImgSrc("");
      }}
    />
  );
}

export default function NgePlayPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [tab, setTab] = useState<"explore" | "channel" | "queue" | "liked" | "history">("explore");
  const [panelTab, setPanelTab] = useState<"lyrics" | "queue">("lyrics");
  const [query, setQuery] = useState("");
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState("");
  const [heroTitle, setHeroTitle] = useState("Loading YouTube Music...");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(true);

  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [channelTracks, setChannelTracks] = useState<Track[]>([]);
  const [channelCont, setChannelCont] = useState<string | undefined>();
  const [channelApiKey, setChannelApiKey] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [lyricOffset, setLyricOffset] = useState(0);
  const [lyricVariantIdx, setLyricVariantIdx] = useState(0);
  const lyricsBoxRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [activity, setActivity] = useState<ActivityMap>({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

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
    showVideo,
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
      showVideo,
      tab,
    };
  }, [queue, currentIndex, currentTime, isPlaying, volume, muted, repeat, shuffle, showVideo, tab]);

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
          showVideo: s.showVideo,
          tab: s.tab === "channel" ? "explore" : s.tab,
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
      const act = read("activity");
      const rawSession = read("session");
      setLiked(l ? JSON.parse(l) : []);
      setHistory(h ? JSON.parse(h) : []);
      setActivity(act ? JSON.parse(act) : {});
      if (rawSession) {
        const s = JSON.parse(rawSession);
        if (Array.isArray(s.queue) && s.queue.length > 0) {
          hasSavedQueue = true;
          const idx = Math.min(Math.max(0, Number(s.currentIndex) || 0), s.queue.length - 1);
          setQueue(s.queue);
          setCurrentIndex(idx);
          setCurrentTime(Number(s.currentTime) || 0);
          if (typeof s.volume === "number") setVolume(s.volume);
          if (typeof s.muted === "boolean") setMuted(s.muted);
          if (typeof s.repeat === "boolean") setRepeat(s.repeat);
          if (typeof s.shuffle === "boolean") setShuffle(s.shuffle);
          if (typeof s.showVideo === "boolean") setShowVideo(s.showVideo);
          if (s.tab && s.tab !== "channel") setTab(s.tab);
          pendingResumeRef.current = {
            videoId: s.queue[idx].id,
            seekTo: Number(s.currentTime) || 0,
            autoPlay: Boolean(s.isPlaying),
          };
        }
      }
    } catch {}
    return hasSavedQueue;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      toast.error(
        err === "missing_config"
          ? "Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in .env.local first."
          : "Google sign-in failed. Please try again."
      );
      window.history.replaceState({}, "", "/");
    }

    let cancelled = false;
    const authReq = fetch("/api/auth/me")
      .then((r) => r.json())
      .catch(() => null);
    const exploreReq = fetchYouTubeExplore();

    authReq.then((res) => {
      if (cancelled) return;
      const u = res?.user?.sub ? res.user : null;
      if (u) setUser(u);
      const hadQueue = hydrateForUser(u ? u.sub : "guest");
      hydratedRef.current = true;
      setAuthLoaded(true);

      exploreReq.then((data) => {
        if (cancelled) return;
        setPlaylists(data.playlists);
        setActivePlaylistId(data.activePlaylistId);
        setHeroTitle(data.activeTitle);
        setResults(data.tracks);
        if (!hadQueue && data.tracks.length > 0) {
          setQueue(data.tracks);
        }
        setSearching(false);
      });
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
        height: "180",
        width: "320",
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
  }, [queue, currentIndex, isPlaying, volume, muted, repeat, shuffle, showVideo, tab]);

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

  function readSavedOffset(trackId: string): number {
    try {
      const raw = localStorage.getItem(skey("lyric_offsets"));
      const map = raw ? JSON.parse(raw) : null;
      const v = map?.[trackId];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }

  function updateLyricOffset(nextVal: number) {
    const val = Number(nextVal.toFixed(2));
    setLyricOffset(val);
    const tid = currentTrack?.id;
    if (!tid) return;
    try {
      const raw = localStorage.getItem(skey("lyric_offsets"));
      const map = raw ? JSON.parse(raw) : {};
      if (val === 0) delete map[tid];
      else map[tid] = val;
      localStorage.setItem(skey("lyric_offsets"), JSON.stringify(map));
    } catch {}
  }

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
        const day = getDayKey();
        setActivity((prev) => {
          const next = { ...prev, [day]: Math.floor(prev[day] || 0) + whole };
          try {
            localStorage.setItem(skey("activity"), JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    }, 80);

    return () => clearInterval(t);
  }, [isPlaying]);

  useEffect(() => {
    if (!currentTrack?.id) return;
    setLyricOffset(readSavedOffset(currentTrack.id));
  }, [currentTrack?.id, authLoaded]);

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
        (acc, line, idx) => (line.time <= currentTime + LYRIC_LEAD_SEC + lyricOffset ? idx : acc),
        -1
      )
    : -1;

  useEffect(() => {
    const box = lyricsBoxRef.current;
    const el = activeLyricRef.current;
    if (panelTab === "lyrics" && box && el) {
      box.scrollTo({
        top: Math.max(0, el.offsetTop - box.clientHeight * 0.35),
        behavior: "smooth",
      });
    }
  }, [activeLyricIndex, panelTab]);

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

  function addToQueue(track: Track, e: React.MouseEvent) {
    e.stopPropagation();
    if (queue.some((t) => t.id === track.id)) return toast.info("Already in queue");
    setQueue((prev) => [...prev, track]);
    toast.success("Added to queue");
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

  async function openChannel(trackOrId: Track | string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setSearching(true);
    setTab("channel");
    try {
      let cid = typeof trackOrId === "string" ? trackOrId : trackOrId.channelId;
      const knownName = typeof trackOrId === "string" ? undefined : trackOrId.channel;
      if (!cid && typeof trackOrId !== "string") {
        cid = (await resolveChannelFromVideo(trackOrId.id)) || undefined;
      }
      if (!cid) {
        toast.error("Channel not found");
        setTab("explore");
        return;
      }
      const data = await fetchYouTubeChannel(cid, undefined, undefined, knownName);
      if (!data) {
        toast.error("Failed to load channel tracks");
        setTab("explore");
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
    setTab("explore");
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
    setTab("explore");
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    hydrateForUser("guest");
    toast.success("Signed out of Google");
  }

  const isCurrentLiked = liked.some((t) => t.id === currentTrack?.id);
  const displayedTracks =
    tab === "channel"
      ? channelTracks
      : tab === "explore"
      ? results
      : tab === "queue"
      ? queue
      : tab === "liked"
      ? liked
      : history;
  const totalSec = displayedTracks.reduce((acc, t) => acc + parseDurationSec(t.duration), 0);
  const heroCover =
    (tab === "channel" && channelInfo?.avatar) ||
    displayedTracks[0]?.thumbnail ||
    currentTrack?.thumbnail;
  const sectionTitle =
    tab === "channel"
      ? channelInfo?.title || "Channel"
      : tab === "explore"
      ? heroTitle
      : tab === "queue"
      ? "Play Queue"
      : tab === "liked"
      ? "Liked Songs"
      : "Recently Played";

  const weekBars = getWeekBars(activity);
  const maxBarSec = Math.max(60, ...weekBars.map((b) => b.sec));
  const totalWeekSec = weekBars.reduce((acc, b) => acc + b.sec, 0);

  return (
    <div className="min-h-screen bg-[#F3F5F9] text-[#111827] lg:p-5 flex justify-center select-none">
      <div className="w-full max-w-[1360px] bg-white lg:rounded-[28px] shadow-[0_20px_60px_rgba(15,23,42,0.06)] border border-black/[0.04] flex flex-col lg:flex-row overflow-hidden min-h-screen lg:min-h-[calc(100vh-40px)] lg:max-h-[calc(100vh-40px)]">
        <div className="flex-1 flex flex-col min-w-0 p-4 sm:p-7 overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 pb-5 shrink-0">
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                onClick={() => {
                  setTab("explore");
                  if (!activePlaylistId && playlists[0]) handleSelectPlaylist(playlists[0]);
                }}
                className="flex items-center gap-2 cursor-pointer group shrink-0"
              >
                <span className="w-7 h-7 rounded-lg bg-[#EE3B3B] group-hover:bg-[#DC2F2F] transition-colors flex items-center justify-center shadow-sm shadow-[#EE3B3B]/25">
                  <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" strokeLinejoin="round" />
                </span>
                <span className="font-extrabold text-sm tracking-tight text-[#111827]">
                  Nge-Play
                </span>
              </button>
              <nav className="flex items-center gap-1">
                {[
                  { id: "explore", label: "Explore" },
                  { id: "queue", label: `Queue (${queue.length})` },
                  { id: "liked", label: `Liked (${liked.length})` },
                  { id: "history", label: "History" },
                ].map((item) => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        active
                          ? "bg-[#FCEAEA] text-[#D9383A] font-semibold"
                          : "text-[#7A818E] hover:text-[#111827] font-medium"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
                {tab === "channel" && (
                  <button
                    onClick={() => setTab("explore")}
                    className="px-2.5 py-1.5 rounded-xl text-xs bg-[#FCEAEA] text-[#D9383A] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Artist
                  </button>
                )}
              </nav>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch(query);
                }}
                className="relative flex-1 sm:w-64"
              >
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search songs, artist, @handle, or link..."
                  className="w-full bg-[#F5F6F8] border border-transparent focus:border-[#F5B5B5] focus:bg-white rounded-full pl-8 pr-7 py-1.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none transition-all"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      if (!activePlaylistId && playlists[0]) handleSelectPlaylist(playlists[0]);
                    }}
                    title="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </form>
              <button
                onClick={() => setShowVideo((v) => !v)}
                title="Toggle Video"
                className={`p-2 rounded-full border text-xs transition-colors cursor-pointer shrink-0 ${
                  showVideo
                    ? "bg-[#FCEAEA] border-[#F5B5B5] text-[#D9383A]"
                    : "bg-[#F5F6F8] border-transparent text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>

          <section className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#F3F5F9] border border-black/[0.05] shrink-0">
                <TrackCover
                  src={heroCover}
                  trackId={
                    tab === "channel" && channelInfo?.avatar
                      ? undefined
                      : displayedTracks[0]?.id || currentTrack?.id
                  }
                  alt={sectionTitle}
                  iconClass="w-5 h-5"
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#111827] truncate">
                  {sectionTitle}
                </h1>
                <p className="text-xs text-[#6B7280] mt-0.5 flex flex-wrap items-center gap-1.5 truncate">
                  {tab === "channel" && channelInfo ? (
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
                          <span className="text-[#D1D5DB]">·</span>
                          <span>{formatTime(totalSec)}</span>
                        </>
                      )}
                      {currentTrack && (
                        <>
                          <span className="text-[#D1D5DB]">·</span>
                          <button
                            onClick={(e) => openChannel(currentTrack, e)}
                            className="hover:text-[#D9383A] transition-colors truncate cursor-pointer"
                          >
                            {currentTrack.channel}
                          </button>
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
                  className="bg-[#EE3B3B] hover:bg-[#DC2F2F] text-white text-xs font-bold px-4 py-2 rounded-full shadow-sm shadow-[#EE3B3B]/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Play All</span>
                </button>
              )}
              {tab !== "channel" && currentTrack && (
                <button
                  onClick={(e) => openChannel(currentTrack, e)}
                  className="bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#374151] text-xs font-semibold px-3.5 py-2 rounded-full transition-colors cursor-pointer"
                >
                  Artist
                </button>
              )}
              {tab === "queue" && queue.length > 1 && currentTrack && (
                <button
                  onClick={() => setQueue([currentTrack])}
                  className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:text-[#D9383A] px-2.5 py-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </section>

          {tab === "explore" && playlists.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-3 shrink-0">
              {playlists.map((pl) => {
                const active = activePlaylistId === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleSelectPlaylist(pl)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? "bg-[#FCEAEA] text-[#D9383A] border-[#F8CACA]"
                        : "bg-[#F8F9FB] text-[#6B7280] border-black/[0.04] hover:text-[#111827]"
                    }`}
                  >
                    {pl.title}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] border-b border-[#F3F4F6] shrink-0">
            <span>Track</span>
            <span className="hidden sm:block">Artist</span>
            <span className="hidden md:block text-right">Plays</span>
            <span className="hidden sm:block text-right">Time</span>
            <span />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#F3F4F6] pr-1 pb-24 lg:pb-2">
            {searching ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#6B7280] gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#EE3B3B]" />
                <p className="text-xs font-medium">Loading music from YouTube Music...</p>
              </div>
            ) : displayedTracks.length === 0 ? (
              <div className="text-center py-16 text-[#9CA3AF] text-xs">
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
                    className={`group grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_80px_52px_64px] gap-3 items-center px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                      isCurrent ? "bg-[#FDF0F0]" : "hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-[#F3F5F9] shrink-0">
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
                            <Pause className="w-3.5 h-3.5 text-white fill-white" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-[13px] font-semibold truncate ${
                            isCurrent ? "text-[#D9383A]" : "text-[#111827]"
                          }`}
                        >
                          {track.title}
                        </p>
                        <button
                          onClick={(e) => openChannel(track, e)}
                          className="text-[11px] text-[#6B7280] hover:text-[#D9383A] truncate sm:hidden text-left cursor-pointer"
                        >
                          {track.channel}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={(e) => openChannel(track, e)}
                      className="hidden sm:block text-xs text-[#6B7280] hover:text-[#D9383A] truncate text-left transition-colors cursor-pointer"
                    >
                      {track.channel}
                    </button>
                    <p className="hidden md:block text-xs text-[#9CA3AF] text-right truncate tabular-nums">
                      {track.views || "—"}
                    </p>
                    <p className="hidden sm:block text-xs text-[#6B7280] text-right tabular-nums">
                      {track.duration}
                    </p>

                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => toggleLike(track, e)}
                        title="Like"
                        className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#D9383A] transition-colors cursor-pointer"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isTrackLiked ? "fill-[#EE3B3B] text-[#EE3B3B]" : ""}`} />
                      </button>
                      <button
                        onClick={(e) => addToQueue(track, e)}
                        title="Add to Queue"
                        className="p-1.5 rounded-lg text-[#D9383A] hover:bg-[#FCEAEA] transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {tab === "channel" && channelCont && (
              <div className="py-4 flex justify-center">
                <button
                  onClick={loadMoreChannel}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-semibold text-[#111827] flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EE3B3B]" />}
                  <span>{loadingMore ? "Loading tracks..." : "Load More"}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="w-full lg:w-[340px] xl:w-[360px] bg-[#F6F7FA] lg:m-4 lg:rounded-3xl p-5 flex flex-col gap-4 shrink-0 border-t lg:border border-black/[0.04] overflow-y-auto pb-28 lg:pb-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-black/[0.05]">
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-9 h-9 rounded-full object-cover border border-black/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#FCEAEA] text-[#D9383A] text-xs font-extrabold flex items-center justify-center shrink-0">
                  {user ? user.name[0]?.toUpperCase() : "G"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#111827] truncate">
                  {user ? user.name : "Guest"}
                </p>
                <p className="text-[11px] text-[#6B7280] truncate">
                  {user ? user.email : "Saved locally · Not signed in"}
                </p>
              </div>
            </div>
            {user ? (
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#D9383A] hover:bg-white transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : authLoaded ? (
              <a
                href="/api/auth/login"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-black/[0.06] text-[11px] font-semibold text-[#111827] hover:bg-[#FCEAEA] hover:text-[#D9383A] transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24Z" />
                  <path fill="#FBBC05" d="M5.3 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V6.7H1.3C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l4-3.1Z" />
                  <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5C18 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.7l4 3.1c.9-2.9 3.6-5 6.7-5Z" />
                </svg>
                <span>Sign in</span>
              </a>
            ) : null}
          </div>

          {currentTrack && (
            <div className="flex items-center gap-3">
              <TrackCover
                src={currentTrack.thumbnail}
                trackId={currentTrack.id}
                alt={currentTrack.title}
                className="w-11 h-11 rounded-xl object-cover border border-black/[0.05] shrink-0"
                iconClass="w-4 h-4"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-[#111827] truncate">{currentTrack.title}</p>
                <button
                  onClick={(e) => openChannel(currentTrack, e)}
                  className="text-xs text-[#6B7280] hover:text-[#D9383A] truncate block text-left cursor-pointer"
                >
                  {currentTrack.channel}
                </button>
              </div>
              <button
                onClick={() => toggleLike(currentTrack)}
                className="p-1.5 text-[#9CA3AF] hover:text-[#EE3B3B] transition-colors cursor-pointer shrink-0"
              >
                <Heart className={`w-4 h-4 ${isCurrentLiked ? "fill-[#EE3B3B] text-[#EE3B3B]" : ""}`} />
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl p-3.5 border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-3">
            <div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={Math.min(currentTime, duration || 100)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full h-1.5 bg-[#EDEDED] accent-[#EE3B3B] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-semibold text-[#9CA3AF] mt-1 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShuffle((s) => !s)}
                title="Shuffle"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  shuffle ? "text-[#D9383A] bg-[#FCEAEA]" : "text-[#9CA3AF] hover:text-[#111827]"
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handlePrev}
                title="Previous"
                className="p-1.5 text-[#111827] hover:text-[#EE3B3B] transition-colors cursor-pointer"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                title={isPlaying ? "Pause" : "Play"}
                className="w-9 h-9 rounded-full bg-[#EE3B3B] hover:bg-[#DC2F2F] text-white flex items-center justify-center shadow-sm shadow-[#EE3B3B]/30 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>
              <button
                onClick={handleNext}
                title="Next"
                className="p-1.5 text-[#111827] hover:text-[#EE3B3B] transition-colors cursor-pointer"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => setRepeat((r) => !r)}
                title="Repeat"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  repeat ? "text-[#D9383A] bg-[#FCEAEA]" : "text-[#9CA3AF] hover:text-[#111827]"
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-[#F3F4F6]">
              <button
                onClick={toggleMute}
                className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-[#D9383A]" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolume(Number(e.target.value))}
                className="flex-1 h-1 bg-[#EDEDED] accent-[#EE3B3B] rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 bg-white/80 p-0.5 rounded-lg border border-black/[0.04]">
                {[
                  { id: "lyrics", label: "Lyrics" },
                  { id: "queue", label: "Queue" },
                ].map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setPanelTab(pt.id as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      panelTab === pt.id
                        ? "bg-[#FCEAEA] text-[#D9383A]"
                        : "text-[#6B7280] hover:text-[#111827]"
                    }`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
              {panelTab === "lyrics" && activeLyrics?.synced.length ? (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[#6B7280] tabular-nums">
                  {lyrics?.variants && lyrics.variants.length > 1 ? (
                    <button
                      onClick={() => setLyricVariantIdx((i) => (i + 1) % lyrics.variants!.length)}
                      title="Switch lyric timing version"
                      className="px-1.5 py-0.5 rounded bg-white border border-black/[0.05] text-[#D9383A] hover:bg-[#FCEAEA] cursor-pointer"
                    >
                      v{lyricVariantIdx + 1}/{lyrics.variants.length}
                    </button>
                  ) : null}
                  <button
                    onClick={() => updateLyricOffset(lyricOffset - 0.25)}
                    title="Delay lyrics (-0.25s)"
                    className="px-1.5 py-0.5 rounded bg-white border border-black/[0.05] hover:text-[#111827] cursor-pointer"
                  >
                    -0.25s
                  </button>
                  <button
                    onClick={() => updateLyricOffset(0)}
                    title="Reset lyric sync"
                    className={`px-1 py-0.5 rounded cursor-pointer ${
                      lyricOffset !== 0 ? "text-[#D9383A]" : "text-[#9CA3AF]"
                    }`}
                  >
                    {lyricOffset > 0 ? `+${lyricOffset}s` : `${lyricOffset}s`}
                  </button>
                  <button
                    onClick={() => updateLyricOffset(lyricOffset + 0.25)}
                    title="Advance lyrics (+0.25s)"
                    className="px-1.5 py-0.5 rounded bg-white border border-black/[0.05] hover:text-[#111827] cursor-pointer"
                  >
                    +0.25s
                  </button>
                </div>
              ) : null}
            </div>

            {panelTab === "lyrics" && (
              <div
                ref={lyricsBoxRef}
                translate="no"
                className="notranslate relative bg-white rounded-2xl p-3 border border-black/[0.04] max-h-56 overflow-y-auto space-y-1.5"
              >
                {loadingLyrics ? (
                  <div className="flex items-center gap-2 text-xs text-[#6B7280] py-6 justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EE3B3B]" />
                    <span>Finding lyrics...</span>
                  </div>
                ) : activeLyrics?.synced.length ? (
                  activeLyrics.synced.map((line, i) => {
                    const active = i === activeLyricIndex;
                    return (
                      <button
                        key={`${line.time}-${i}`}
                        ref={active ? activeLyricRef : null}
                        onClick={() => handleSeek(Math.max(0, line.time - lyricOffset))}
                        className={`w-full text-left text-xs leading-relaxed px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                          active
                            ? "bg-[#FDF0F0] text-[#D9383A] font-bold"
                            : "text-[#6B7280] hover:text-[#111827]"
                        }`}
                      >
                        {line.text}
                      </button>
                    );
                  })
                ) : activeLyrics?.plain ? (
                  <pre className="text-xs text-[#374151] whitespace-pre-wrap font-sans leading-relaxed">
                    {activeLyrics.plain}
                  </pre>
                ) : (
                  <p className="text-xs text-[#9CA3AF] text-center py-6">
                    Lyrics unavailable for this track.
                  </p>
                )}
              </div>
            )}

            {panelTab === "queue" && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {queue.filter((t) => t.id !== currentTrack?.id).length === 0 ? (
                  <p className="text-xs text-[#9CA3AF] text-center py-6 bg-white rounded-2xl border border-black/[0.04]">
                    Queue is empty.
                  </p>
                ) : (
                  queue
                    .filter((t) => t.id !== currentTrack?.id)
                    .slice(0, 8)
                    .map((item) => (
                      <div
                        key={item.id}
                        onClick={() => playTrackNow(item, queue)}
                        className="flex items-center gap-2.5 p-1.5 -mx-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer"
                      >
                        <TrackCover
                          src={item.thumbnail}
                          trackId={item.id}
                          alt={item.title}
                          className="w-8 h-8 rounded-lg object-cover shrink-0"
                          iconClass="w-3.5 h-3.5"
                          lazy
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#111827] truncate">{item.title}</p>
                          <p className="text-[10px] text-[#6B7280] truncate">{item.channel}</p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-[#111827]">Activity Time</h2>
                {isPlaying && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EE3B3B] animate-pulse" />
                )}
              </div>
              <span className="text-[11px] font-semibold text-[#6B7280] tabular-nums">
                {formatActivityLive(totalWeekSec)} / 7h
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 items-end h-28 pt-2">
              {weekBars.map((b) => {
                const pct = b.sec > 0 ? Math.max(18, Math.round((b.sec / maxBarSec) * 100)) : 12;
                const valLabel = b.mins > 0 ? `${b.mins}m` : b.sec > 0 ? `${b.sec}s` : "0";
                return (
                  <div key={b.key} className="flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        title={`${b.label}: ${formatTime(b.sec)}`}
                        style={{ height: `${pct}%` }}
                        className={`w-full rounded-xl flex items-start justify-center pt-1.5 transition-all ${
                          b.isToday
                            ? "bg-[#EE3B3B] text-white"
                            : "bg-[#EAECEF] text-[#6B7280]"
                        }`}
                      >
                        <span className="text-[9px] font-bold leading-none tabular-nums">
                          {valLabel}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        b.isToday ? "text-[#D9383A]" : "text-[#9CA3AF]"
                      }`}
                    >
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      <div
        className={`fixed right-5 bottom-20 lg:bottom-6 z-30 rounded-2xl overflow-hidden border border-black/10 shadow-xl bg-black transition-all ${
          showVideo
            ? "opacity-100 pointer-events-auto scale-100"
            : "opacity-0 pointer-events-none w-px h-px overflow-hidden"
        }`}
      >
        <div id="yt-audio-player" />
      </div>

      {currentTrack && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-black/5 px-4 py-2.5 flex items-center gap-3 z-40">
          <TrackCover
            src={currentTrack.thumbnail}
            trackId={currentTrack.id}
            alt={currentTrack.title}
            className="w-10 h-10 rounded-lg object-cover shrink-0"
            iconClass="w-4 h-4"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#111827] truncate">{currentTrack.title}</p>
            <p className="text-[11px] text-[#6B7280] truncate">{currentTrack.channel}</p>
          </div>
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-[#EE3B3B] text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

