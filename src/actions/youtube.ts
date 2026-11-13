"use server";

import { headers } from "next/headers";

export interface Track {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  duration: string;
  thumbnail: string;
  views?: string;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  channelId?: string;
  thumbnail: string;
}

export interface ArtistSummary {
  id: string;
  name: string;
  subscribers?: string;
  avatar: string;
}

export interface ChannelInfo {
  id: string;
  title: string;
  handle?: string;
  avatar?: string;
  subscribers?: string;
  videoCount?: string;
}

export interface ChannelVideosResult {
  channel: ChannelInfo;
  tracks: Track[];
  continuation?: string;
}

export interface ClientGeo {
  gl: string;
  hl: string;
  countryName: string;
  clientIp?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  MY: "Malaysia",
  ID: "Indonesia",
  SG: "Singapore",
  PH: "Philippines",
  TH: "Thailand",
  VN: "Vietnam",
  JP: "Japan",
  KR: "Korea",
  US: "United States",
  GB: "United Kingdom",
  AU: "Australia",
  IN: "India",
  BR: "Brazil",
};

const LANG_MAP: Record<string, string> = {
  MY: "ms",
  ID: "id",
  JP: "ja",
  KR: "ko",
  TH: "th",
  VN: "vi",
};

export async function resolveClientGeo(clientHint?: string): Promise<ClientGeo> {
  let country = (clientHint || "").trim().toUpperCase();
  let clientIp = "";

  try {
    const headerList = await headers();
    const cfCountry = headerList.get("cf-ipcountry");
    const vercelCountry = headerList.get("x-vercel-ip-country");
    const xCountry = headerList.get("x-country-code");
    const detected = cfCountry || vercelCountry || xCountry;
    if (detected && detected !== "XX" && detected !== "T1" && detected.length === 2) {
      country = detected.toUpperCase();
    }
    const forwarded = headerList.get("x-forwarded-for");
    const cfIp = headerList.get("cf-connecting-ip");
    const realIp = headerList.get("x-real-ip");
    clientIp = cfIp || realIp || (forwarded ? forwarded.split(",")[0].trim() : "");
  } catch {}

  if (!country || country.length !== 2) {
    country = "ID";
  }

  const countryName = COUNTRY_NAMES[country] || country;
  const hl = LANG_MAP[country] || "en";

  return { gl: country, hl, countryName, clientIp };
}

const YTM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Origin: "https://music.youtube.com",
  Referer: "https://music.youtube.com/",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "SOCS=CAI",
};

// ponytail: direct InnerTube WEB_REMIX POST — add visitorData/clientVersion rotation if rate-limited
async function ytmPost(
  endpoint: string,
  body: Record<string, any>,
  geo?: Partial<ClientGeo>
): Promise<any | null> {
  try {
    const gl = geo?.gl || "ID";
    const hl = geo?.hl || (gl === "MY" ? "ms" : "en");
    const reqHeaders: Record<string, string> = {
      ...YTM_HEADERS,
      "Accept-Language": hl === "ms" ? "ms,en;q=0.9" : hl === "id" ? "id,en;q=0.9" : "en-US,en;q=0.9",
    };
    if (geo?.clientIp) {
      reqHeaders["X-Forwarded-For"] = geo.clientIp;
    }
    reqHeaders["X-YouTube-Client-Country"] = gl;

    const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB_REMIX",
            clientVersion: "1.20240501.01.00",
            hl,
            gl,
          },
        },
        ...body,
      }),
      cache: "no-store",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function normalizeDuration(raw?: string): string {
  if (!raw) return "—";
  return /^\d+(\.\d{2})+$/.test(raw) ? raw.replace(/\./g, ":") : raw;
}

function extractVideoId(input: string): string | null {
  const match = input.match(
    /(?:(?:music\.)?youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  return null;
}

function extractPlaylistId(input: string): string | null {
  const match = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function toYtmListBrowseId(listId: string): string {
  return listId.startsWith("VL") || listId.startsWith("FE") ? listId : `VL${listId}`;
}

function walkObject(node: any, visitor: (obj: any) => void) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  if (Array.isArray(node)) {
    for (const item of node) walkObject(item, visitor);
  } else {
    for (const key of Object.keys(node)) walkObject(node[key], visitor);
  }
}

function findBrowseId(node: any): string | undefined {
  let found: string | undefined;
  walkObject(node, (o) => {
    if (found) return;
    const id = o?.browseEndpoint?.browseId;
    if (typeof id === "string" && id.startsWith("UC")) found = id;
  });
  return found;
}

function findContinuation(node: any): string | undefined {
  let found: string | undefined;
  walkObject(node, (o) => {
    if (found) return;
    const tok =
      o?.nextContinuationData?.continuation ||
      o?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (typeof tok === "string" && tok) found = tok;
  });
  return found;
}

function extractRunsMeta(runs: any[]) {
  const artists: string[] = [];
  let channelId: string | undefined;
  let fallbackChannel: string | undefined;
  let duration: string | undefined;
  let views: string | undefined;

  for (const r of runs) {
    const text = String(r?.text || "").trim();
    if (!text || text === "•" || text === "·") continue;
    if (/^\d+:\d{2}(?::\d{2})?$/.test(text)) {
      duration = text;
      continue;
    }
    if (/[\d.,]+\s*[kmb]?\s*(?:plays?|views?)/i.test(text)) {
      views = text;
      continue;
    }
    const browse = r?.navigationEndpoint?.browseEndpoint;
    const bid = browse?.browseId;
    const pageType =
      browse?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (
      typeof bid === "string" &&
      (bid.startsWith("UC") ||
        pageType === "MUSIC_PAGE_TYPE_ARTIST" ||
        pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL")
    ) {
      artists.push(text);
      if (!channelId && bid.startsWith("UC")) channelId = bid;
      continue;
    }
    if (
      !fallbackChannel &&
      pageType !== "MUSIC_PAGE_TYPE_ALBUM" &&
      !(typeof bid === "string" && (bid.startsWith("MPRE") || bid.startsWith("VL"))) &&
      !/^\d{4}$/.test(text) &&
      !/^(?:song|video|single|ep|album)$/i.test(text)
    ) {
      fallbackChannel = text;
    }
  }

  return {
    channel: artists.join(", ") || fallbackChannel || "YouTube Music",
    channelId,
    duration,
    views,
  };
}

function ytmThumb(thumbs: any[] | undefined, videoId: string, size = 544): string {
  const url = thumbs?.slice(-1)[0]?.url;
  if (!url) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url.replace(/=w\d+-h\d+([^&\s]*)/i, `=w${size}-h${size}$1`);
}

function parseYtmTracks(
  data: any,
  limit = 30,
  fallback?: { channel?: string; channelId?: string; thumbnail?: string }
): Track[] {
  const seen = new Set<string>();
  const tracks: Track[] = [];

  walkObject(data, (o) => {
    if (tracks.length >= limit) return;

    const m = o?.musicResponsiveListItemRenderer;
    if (m) {
      const flexCols = m.flexColumns || [];
      const titleRuns = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const videoId =
        m.playlistItemData?.videoId ||
        titleRuns[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
        m.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId;
      if (!videoId || seen.has(videoId)) return;
      seen.add(videoId);

      const subRuns = [
        ...flexCols
          .slice(1)
          .flatMap((c: any) => c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []),
        ...(m.fixedColumns || []).flatMap(
          (c: any) => c?.musicResponsiveListItemFixedColumnRenderer?.text?.runs || []
        ),
      ];
      const meta = extractRunsMeta(subRuns);
      const thumbs = m.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      tracks.push({
        id: videoId,
        title: titleRuns.map((r: any) => r.text).join("").trim() || "Untitled",
        channel:
          meta.channel === "YouTube Music" && fallback?.channel ? fallback.channel : meta.channel,
        channelId: meta.channelId || fallback?.channelId,
        duration: normalizeDuration(meta.duration),
        views: meta.views,
        thumbnail: thumbs?.length
          ? ytmThumb(thumbs, videoId)
          : fallback?.thumbnail || ytmThumb(undefined, videoId),
      });
      return;
    }

    const t = o?.musicTwoRowItemRenderer;
    const twoRowId = t?.navigationEndpoint?.watchEndpoint?.videoId;
    if (t && twoRowId && !seen.has(twoRowId)) {
      seen.add(twoRowId);
      const meta = extractRunsMeta(t.subtitle?.runs || []);
      const thumbs = t.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      tracks.push({
        id: twoRowId,
        title: (t.title?.runs || []).map((r: any) => r.text).join("").trim() || "Untitled",
        channel:
          meta.channel === "YouTube Music" && fallback?.channel ? fallback.channel : meta.channel,
        channelId: meta.channelId || fallback?.channelId,
        duration: normalizeDuration(meta.duration),
        views: meta.views,
        thumbnail: thumbs?.length
          ? ytmThumb(thumbs, twoRowId)
          : fallback?.thumbnail || ytmThumb(undefined, twoRowId),
      });
    }
  });

  return tracks;
}

function parseYtmPlaylists(data: any, limit = 8): YouTubePlaylist[] {
  const seen = new Set<string>();
  const list: YouTubePlaylist[] = [];
  walkObject(data, (o) => {
    if (list.length >= limit) return;
    const t = o?.musicTwoRowItemRenderer;
    const id = t?.navigationEndpoint?.browseEndpoint?.browseId;
    const title = (t?.title?.runs || []).map((r: any) => r.text).join("").trim();
    if (!id || !title || !id.startsWith("VL") || seen.has(id)) return;
    seen.add(id);
    list.push({ id, title });
  });
  return list;
}

// ponytail: in-memory cache for track durations, capped at 1500 items
const DURATION_CACHE_MAX = 1500;
const durationCache = new Map<string, string>();

export async function hydrateTrackDurations<T extends Track>(tracks: T[]): Promise<T[]> {
  const missingTracks = tracks.filter((t) => t.id && (!t.duration || t.duration === "—"));
  if (!missingTracks.length) return tracks;

  const missingIds = [
    ...new Set(
      missingTracks
        .map((t) => t.id)
        .filter((id) => !durationCache.has(id))
    ),
  ];

  if (missingIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < missingIds.length; i += 40) {
      chunks.push(missingIds.slice(i, i + 40));
    }

    await Promise.all(
      chunks.map(async (videoIds) => {
        const res = await ytmPost("music/get_queue", { videoIds });
        if (!res) return;
        walkObject(res, (o) => {
          const p = o?.playlistPanelVideoRenderer;
          const id = p?.videoId;
          const raw = p?.lengthText?.runs?.[0]?.text || p?.lengthText?.simpleText;
          if (id && raw) {
            if (durationCache.size >= DURATION_CACHE_MAX) {
              const oldest = durationCache.keys().next().value;
              if (oldest) durationCache.delete(oldest);
            }
            durationCache.set(id, normalizeDuration(String(raw)));
          }
        });
      })
    );
  }

  return tracks.map((t) =>
    (!t.duration || t.duration === "—") && durationCache.has(t.id)
      ? { ...t, duration: durationCache.get(t.id)! }
      : t
  );
}

function parseYtmAlbums(dataList: any[], limit = 16): AlbumSummary[] {
  const seen = new Set<string>();
  const albums: AlbumSummary[] = [];
  for (const data of dataList) {
    walkObject(data, (o) => {
      if (albums.length >= limit) return;
      const t = o?.musicTwoRowItemRenderer;
      if (!t) return;
      const browse = t.navigationEndpoint?.browseEndpoint;
      const id = browse?.browseId || "";
      const pageType =
        browse?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
      if (!id || (!id.startsWith("MPRE") && pageType !== "MUSIC_PAGE_TYPE_ALBUM") || seen.has(id)) {
        return;
      }
      seen.add(id);
      const title = (t.title?.runs || []).map((r: any) => r.text).join("").trim();
      const subRuns = t.subtitle?.runs || [];
      const subtitle = subRuns.map((r: any) => r.text).join("").trim();
      const meta = extractRunsMeta(subRuns);
      const rawThumb =
        t.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || "";
      if (!title || !rawThumb) return;
      albums.push({
        id,
        title,
        subtitle: subtitle || meta.channel,
        artist: meta.channel,
        channelId: meta.channelId,
        thumbnail: rawThumb.replace(/=w\d+-h\d+([^&\s]*)/i, "=w544-h544$1"),
      });
    });
  }
  return albums;
}

function parseYtmArtists(dataList: any[], limit = 16): ArtistSummary[] {
  const seen = new Set<string>();
  const artists: ArtistSummary[] = [];
  const push = (id: string, name: string, subscribers: string, rawThumb: string) => {
    if (!id || !name || !rawThumb || seen.has(id) || artists.length >= limit) return;
    seen.add(id);
    artists.push({
      id,
      name,
      subscribers: subscribers || undefined,
      avatar: rawThumb.replace(/=w\d+-h\d+([^&\s]*)/i, "=w240-h240$1"),
    });
  };
  for (const data of dataList) {
    walkObject(data, (o) => {
      if (artists.length >= limit) return;
      const t = o?.musicTwoRowItemRenderer;
      if (t) {
        const b = t.navigationEndpoint?.browseEndpoint;
        const id = b?.browseId || "";
        const pt = b?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
        if (id.startsWith("UC") || pt === "MUSIC_PAGE_TYPE_ARTIST") {
          push(
            id,
            (t.title?.runs || []).map((r: any) => r.text).join("").trim(),
            (t.subtitle?.runs || []).map((r: any) => r.text).join("").trim(),
            t.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || ""
          );
        }
      }
      const m = o?.musicResponsiveListItemRenderer;
      if (m) {
        const b = m.navigationEndpoint?.browseEndpoint;
        const id = b?.browseId || "";
        const pt = b?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
        if (id.startsWith("UC") || pt === "MUSIC_PAGE_TYPE_ARTIST") {
          const cols = m.flexColumns || [];
          push(
            id,
            (cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])
              .map((r: any) => r.text).join("").trim(),
            (cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])
              .map((r: any) => r.text).join("").trim(),
            m.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || ""
          );
        }
      }
    });
  }
  return artists;
}

// ponytail: in-memory explore cache with 3-minute TTL to reduce upstream YouTube hits
interface ExploreCacheEntry {
  data: {
    playlists: YouTubePlaylist[];
    activePlaylistId: string;
    activeTitle: string;
    tracks: Track[];
    trending: Track[];
    albums: AlbumSummary[];
    artists: ArtistSummary[];
  };
  expiresAt: number;
}
const exploreCache = new Map<string, ExploreCacheEntry>();
const EXPLORE_CACHE_TTL_MS = 3 * 60 * 1000;

export async function fetchYouTubeExplore(
  playlistId?: string,
  clientCountry?: string
): Promise<{
  playlists: YouTubePlaylist[];
  activePlaylistId: string;
  activeTitle: string;
  tracks: Track[];
  trending: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
}> {
  const geo = await resolveClientGeo(clientCountry);
  const cacheKey = `${playlistId || "__default__"}:${geo.gl}`;
  const cached = exploreCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [homeData, chartsData, exploreData] = await Promise.all([
    ytmPost("browse", { browseId: "FEmusic_home" }, geo),
    ytmPost("browse", { browseId: "FEmusic_charts" }, geo),
    ytmPost("browse", { browseId: "FEmusic_explore" }, geo),
  ]);

  const playlists: YouTubePlaylist[] = [
    { id: "FEmusic_home", title: "Quick Picks" },
    { id: "FEmusic_explore", title: `Trending ${geo.countryName}` },
  ];
  const seenPl = new Set(playlists.map((p) => p.id));
  for (const pl of [...parseYtmPlaylists(chartsData, 6), ...parseYtmPlaylists(homeData, 6)]) {
    if (seenPl.has(pl.id)) continue;
    seenPl.add(pl.id);
    playlists.push(pl);
    if (playlists.length >= 8) break;
  }

  const selected =
    playlists.find((p) => p.id === playlistId) ||
    (playlistId ? { id: playlistId, title: "YouTube Music" } : playlists[0]);

  let rawTrending: Track[] = [];
  try {
    const localTrending = await searchYouTube(`Trending ${geo.countryName}`, geo);
    if (localTrending.length) rawTrending = localTrending.slice(0, 12);
  } catch {}
  if (!rawTrending.length) {
    const chartsTracks = parseYtmTracks(chartsData, 12);
    rawTrending = chartsTracks.length ? chartsTracks : parseYtmTracks(exploreData, 12);
  }

  let tracks: Track[] = [];
  if (selected.id === "FEmusic_home") {
    if (homeData) tracks = parseYtmTracks(homeData, 30);
    if (tracks.length < 5) {
      try {
        const localHits = await searchYouTube(`Top Hits ${geo.countryName}`, geo);
        if (localHits.length) tracks = localHits.slice(0, 24);
      } catch {}
    }
  } else if (selected.id === "FEmusic_explore") {
    tracks = rawTrending.length ? rawTrending : (exploreData ? parseYtmTracks(exploreData, 30) : []);
  }

  if (!tracks.length) {
    const browseId = toYtmListBrowseId(selected.id);
    const data = await ytmPost("browse", { browseId }, geo);
    tracks = parseYtmTracks(data, 40);
  }

  if (!tracks.length) {
    tracks = rawTrending.length ? rawTrending : parseYtmTracks([homeData, exploreData, chartsData], 30);
  }
  if (!tracks.length) {
    try {
      const fallbackSearch = await searchYouTube(`Top Hits ${geo.countryName}`, geo);
      if (fallbackSearch.length) {
        tracks = fallbackSearch.slice(0, 20);
      }
    } catch {}
  }

  const albums = parseYtmAlbums([exploreData, homeData], 16);
  const artists = parseYtmArtists([chartsData, homeData], 16);

  const hydrated = await hydrateTrackDurations([...tracks, ...rawTrending]);
  const hTracks = hydrated.slice(0, tracks.length);
  const hTrending = hydrated.slice(tracks.length);

  const result = {
    playlists,
    activePlaylistId: selected.id,
    activeTitle: selected.title,
    tracks: hTracks,
    trending: hTrending,
    albums,
    artists,
  };
  if (exploreCache.size >= 20) {
    const oldest = exploreCache.keys().next().value;
    if (oldest) exploreCache.delete(oldest);
  }
  exploreCache.set(cacheKey, { data: result, expiresAt: Date.now() + EXPLORE_CACHE_TTL_MS });
  return result;
}

export async function fetchYouTubeAlbum(
  albumId: string
): Promise<{ album: AlbumSummary; tracks: Track[] } | null> {
  if (!albumId) return null;
  const data = await ytmPost("browse", { browseId: albumId });
  if (!data) return null;

  let hdr: any = null;
  walkObject(data, (o) => {
    if (hdr) return;
    if (o?.musicResponsiveHeaderRenderer) hdr = o.musicResponsiveHeaderRenderer;
    else if (o?.musicDetailHeaderRenderer) hdr = o.musicDetailHeaderRenderer;
  });

  const title = (hdr?.title?.runs || []).map((r: any) => r.text).join("").trim() || "Album";
  const strapRuns = hdr?.straplineTextOne?.runs || hdr?.subtitle?.runs || [];
  const meta = extractRunsMeta(strapRuns);
  const subtitle = (hdr?.subtitle?.runs || []).map((r: any) => r.text).join("").trim();
  const rawThumb =
    hdr?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || "";
  const thumbnail = rawThumb ? rawThumb.replace(/=w\d+-h\d+([^&\s]*)/i, "=w544-h544$1") : "";

  const parsed = parseYtmTracks(data, 50, {
    channel: meta.channel !== "YouTube Music" ? meta.channel : undefined,
    channelId: meta.channelId,
    thumbnail: thumbnail || undefined,
  });
  const tracks = await hydrateTrackDurations(parsed);

  return {
    album: {
      id: albumId,
      title,
      subtitle: subtitle || meta.channel,
      artist: meta.channel,
      channelId: meta.channelId,
      thumbnail: thumbnail || tracks[0]?.thumbnail || "",
    },
    tracks,
  };
}

export async function fetchRelatedTracks(videoId: string): Promise<Track[]> {
  if (!videoId) return [];
  const nxt = await ytmPost("next", { videoId, isAudioOnly: true });
  let relBid = "";
  walkObject(nxt, (o) => {
    if (relBid) return;
    const bid = o?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    if (typeof bid === "string" && bid.startsWith("MPTRt_")) relBid = bid;
  });
  if (relBid) {
    const rel = await ytmPost("browse", { browseId: relBid });
    const parsed = parseYtmTracks(rel, 24);
    if (parsed.length) return hydrateTrackDurations(parsed);
  }
  const seen = new Set<string>([videoId]);
  const fallback: Track[] = [];
  walkObject(nxt, (o) => {
    if (fallback.length >= 20) return;
    const p = o?.playlistPanelVideoRenderer;
    const id = p?.videoId;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const meta = extractRunsMeta(p.longBylineText?.runs || p.shortBylineText?.runs || []);
    fallback.push({
      id,
      title: (p.title?.runs || []).map((r: any) => r.text).join("").trim() || "Untitled",
      channel: meta.channel,
      channelId: meta.channelId || findBrowseId(p),
      duration: normalizeDuration(p.lengthText?.runs?.[0]?.text || p.lengthText?.simpleText),
      thumbnail: ytmThumb(p.thumbnail?.thumbnails, id),
    });
  });
  return hydrateTrackDurations(fallback);
}

export async function searchYouTube(query: string, geo?: Partial<ClientGeo>): Promise<Track[]> {
  const q = (query || "").trim().slice(0, 150);
  if (!q) return [];

  const listId = extractPlaylistId(q);
  const directId = extractVideoId(q);
  if (listId && !directId) {
    const listData = await ytmPost("browse", { browseId: toYtmListBrowseId(listId) }, geo);
    const items = parseYtmTracks(listData, 40);
    if (items.length) return hydrateTrackDurations(items);
  }

  if (directId) {
    const nxt = await ytmPost("next", { videoId: directId }, geo);
    let pvr: any = null;
    walkObject(nxt, (o) => {
      if (!pvr && o?.playlistPanelVideoRenderer?.videoId === directId) {
        pvr = o.playlistPanelVideoRenderer;
      }
    });
    if (pvr) {
      const meta = extractRunsMeta(pvr.longBylineText?.runs || pvr.shortBylineText?.runs || []);
      return [
        {
          id: directId,
          title:
            (pvr.title?.runs || []).map((r: any) => r.text).join("").trim() ||
            `YouTube Music (${directId})`,
          channel: meta.channel,
          channelId: meta.channelId || findBrowseId(pvr),
          duration: normalizeDuration(pvr.lengthText?.runs?.[0]?.text || pvr.lengthText?.simpleText),
          thumbnail:
            pvr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
        },
      ];
    }
    return [
      {
        id: directId,
        title: `YouTube Music (${directId})`,
        channel: "YouTube Music",
        duration: "—",
        thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
      },
    ];
  }

  const songsData = await ytmPost("search", {
    query: q,
    params: "EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D",
  }, geo);
  const tracks = parseYtmTracks(songsData, 24);

  if (tracks.length < 6) {
    const videosData = await ytmPost("search", {
      query: q,
      params: "EgWKAQIQAWoKEAMQBBAJEAoQBQ%3D%3D",
    }, geo);
    const seen = new Set(tracks.map((t) => t.id));
    for (const v of parseYtmTracks(videosData, 24)) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      tracks.push(v);
      if (tracks.length >= 24) break;
    }
  }

  return hydrateTrackDurations(tracks);
}

export async function resolveChannelFromVideo(videoId: string): Promise<string | null> {
  if (!videoId) return null;
  const nxt = await ytmPost("next", { videoId });
  return findBrowseId(nxt) || null;
}

export async function fetchYouTubeChannel(
  channelId: string,
  continuation?: string,
  knownTitle?: string
): Promise<ChannelVideosResult | null> {
  if (!channelId) return null;

  if (continuation) {
    const res = continuation.startsWith("VL")
      ? await ytmPost("browse", { browseId: continuation })
      : await ytmPost("browse", { continuation });
    if (!res) return null;
    return {
      channel: { id: channelId, title: knownTitle || "Artist" },
      tracks: await hydrateTrackDurations(parseYtmTracks(res, 60)),
      continuation: findContinuation(res),
    };
  }

  let resolvedId = channelId;
  if (channelId.startsWith("@")) {
    const artistSearch = await ytmPost("search", {
      query: channelId,
      params: "EgWKAQIgAWoKEAMQBBAJEAoQBQ%3D%3D",
    });
    const foundId = findBrowseId(artistSearch);
    if (!foundId) return null;
    resolvedId = foundId;
  }

  const data = await ytmPost("browse", { browseId: resolvedId });
  if (!data) return null;

  const hdr =
    data?.header?.musicImmersiveHeaderRenderer ||
    data?.header?.musicVisualHeaderRenderer ||
    data?.header?.musicDetailHeaderRenderer;
  const title = hdr?.title?.runs?.[0]?.text || knownTitle || "Artist";
  const avatar = hdr?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
  const subscribers =
    hdr?.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText?.runs?.[0]?.text;
  const videoCount = hdr?.monthlyListenerCount?.runs?.[0]?.text;

  let seeAllBrowseId: string | undefined;
  walkObject(data, (o) => {
    if (seeAllBrowseId) return;
    const id = o?.musicShelfRenderer?.bottomEndpoint?.browseEndpoint?.browseId;
    if (typeof id === "string" && id.startsWith("VL")) seeAllBrowseId = id;
  });

  return {
    channel: { id: resolvedId, title, avatar, subscribers, videoCount },
    tracks: await hydrateTrackDurations(parseYtmTracks(data, 40)),
    continuation: seeAllBrowseId || findContinuation(data),
  };
}
