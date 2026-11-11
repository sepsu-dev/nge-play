"use server";

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
  apiKey?: string;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricVariant {
  synced: LyricLine[];
  plain: string;
  trackName?: string;
  artistName?: string;
}

export interface LyricsResult extends LyricVariant {
  variants?: LyricVariant[];
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

const YTM_CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240501.01.00",
    hl: "en",
    gl: "ID",
  },
};

// ponytail: direct InnerTube WEB_REMIX POST — add visitorData/clientVersion rotation if rate-limited
async function ytmPost(endpoint: string, body: Record<string, any>): Promise<any | null> {
  try {
    const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers: YTM_HEADERS,
      body: JSON.stringify({ context: YTM_CONTEXT, ...body }),
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

export async function hydrateTrackDurations<T extends Track>(tracks: T[]): Promise<T[]> {
  const missingIds = [
    ...new Set(tracks.filter((t) => t.id && (!t.duration || t.duration === "—")).map((t) => t.id)),
  ];
  if (!missingIds.length) return tracks;

  const durMap = new Map<string, string>();
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
        if (id && raw && !durMap.has(id)) durMap.set(id, normalizeDuration(String(raw)));
      });
    })
  );

  if (!durMap.size) return tracks;
  return tracks.map((t) =>
    (!t.duration || t.duration === "—") && durMap.has(t.id)
      ? { ...t, duration: durMap.get(t.id)! }
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

export async function fetchYouTubeExplore(playlistId?: string): Promise<{
  playlists: YouTubePlaylist[];
  activePlaylistId: string;
  activeTitle: string;
  tracks: Track[];
  trending: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
}> {
  const [homeData, chartsData, exploreData] = await Promise.all([
    ytmPost("browse", { browseId: "FEmusic_home" }),
    ytmPost("browse", { browseId: "FEmusic_charts" }),
    ytmPost("browse", { browseId: "FEmusic_explore" }),
  ]);

  const playlists: YouTubePlaylist[] = [
    { id: "FEmusic_home", title: "Quick Picks" },
    { id: "FEmusic_explore", title: "Trending" },
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

  let tracks: Track[] = [];
  if (selected.id === "FEmusic_home" && homeData) {
    tracks = parseYtmTracks(homeData, 30);
  } else if (selected.id === "FEmusic_explore" && exploreData) {
    tracks = parseYtmTracks(exploreData, 30);
  }
  if (!tracks.length) {
    const browseId = toYtmListBrowseId(selected.id);
    const data = await ytmPost("browse", { browseId });
    tracks = parseYtmTracks(data, 40);
  }

  const chartsTracks = parseYtmTracks(chartsData, 12);
  const rawTrending = chartsTracks.length ? chartsTracks : parseYtmTracks(exploreData, 12);
  const albums = parseYtmAlbums([exploreData, homeData], 16);
  const artists = parseYtmArtists([chartsData, homeData], 16);

  const hydrated = await hydrateTrackDurations([...tracks, ...rawTrending]);
  const hTracks = hydrated.slice(0, tracks.length);
  const hTrending = hydrated.slice(tracks.length);

  return {
    playlists,
    activePlaylistId: selected.id,
    activeTitle: selected.title,
    tracks: hTracks,
    trending: hTrending,
    albums,
    artists,
  };
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

export async function searchYouTube(query: string): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  const listId = extractPlaylistId(q);
  const directId = extractVideoId(q);
  if (listId && !directId) {
    const listData = await ytmPost("browse", { browseId: toYtmListBrowseId(listId) });
    const items = parseYtmTracks(listData, 40);
    if (items.length) return hydrateTrackDurations(items);
  }

  if (directId) {
    const nxt = await ytmPost("next", { videoId: directId });
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
  });
  const tracks = parseYtmTracks(songsData, 24);

  if (tracks.length < 6) {
    const videosData = await ytmPost("search", {
      query: q,
      params: "EgWKAQIQAWoKEAMQBBAJEAoQBQ%3D%3D",
    });
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
  _apiKey?: string,
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

function cleanQueryPart(s: string) {
  return s
    .replace(/\s+[–—]\s+/g, " - ")
    .replace(/\|.*$/g, "")
    .replace(/[「」『』]/g, " ")
    .replace(/\((?:official|lyric|lyrics|audio|video|music video|mv|live|visualizer|hd|4k|prod\.|explicit)[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\((?:feat|ft)\.?\s+[^)]+\)/gi, "")
    .replace(/\s+(?:feat|ft)\.?\s+[^-]+$/i, "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\b(?:official music video|official audio|official video|lyric video|visualizer|mv)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitArtistTrack(title: string, channel: string) {
  const cleanTitle = cleanQueryPart(title);
  const cleanChannel = cleanQueryPart(channel).replace(/vevo$/i, "").trim();
  const sep = cleanTitle.indexOf(" - ");
  if (sep > 0) {
    return {
      artist: cleanTitle.slice(0, sep).trim(),
      track: cleanTitle.slice(sep + 3).trim(),
      cleanTitle,
      fromTitle: true,
    };
  }
  return { artist: cleanChannel, track: cleanTitle, cleanTitle, fromTitle: false };
}

function normText(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const VERSION_TAG_RES = [
  "remix",
  "live",
  "acoustic",
  "cover",
  "karaoke",
  "instrumental",
  "sped up",
  "slowed",
  "nightcore",
  "radio edit",
  "extended",
  "clean version",
  "8d",
  "reverb",
  "unplugged",
  "session",
  "mashup",
  "tribute",
  "demo",
  "english ver",
  "english version",
  "english trans",
  "english translation",
  "indonesian",
  "terjemahan",
  "traducción",
  "traduccion",
  "traduzione",
  "übersetzung",
  "romanized",
  "romaji",
  "romanization",
  "pinyin",
  "bilingual",
  "translated",
  "eng ver",
  "jpn ver",
  "kor ver",
  "esp ver",
  "indo ver",
  "japanese ver",
  "korean ver",
  "spanish ver",
  "chinese ver",
].map((t) => new RegExp(`\\b${t}\\b`, "i"));

const MV_TAG_RE = /\b(official (?:music )?video|music video|mv)\b/i;
const NON_LATIN_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f\u0900-\u097f]/;

function nonLatinRatio(item: any, parsedLines?: LyricLine[]) {
  const lines = parsedLines?.length
    ? parsedLines.map((l) => l.text)
    : String(item?.plainLyrics || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return 0;
  let hits = 0;
  for (const line of lines) {
    if (NON_LATIN_RE.test(line)) hits++;
  }
  return hits / lines.length;
}

function scoreLyricCandidate(
  item: any,
  rawTitle: string,
  track: string,
  artist: string,
  fromTitle: boolean,
  targetDurSec?: number,
  parsedLines?: LyricLine[]
) {
  const hasSynced = typeof item?.syncedLyrics === "string" && item.syncedLyrics.trim().length > 0;
  const hasPlain = typeof item?.plainLyrics === "string" && item.plainLyrics.trim().length > 0;
  if (!hasSynced && !hasPlain) return -1e9;

  let score = hasSynced ? 120 : 20;
  const nTrack = normText(track);
  const rawCandTrack = String(item.trackName || "");
  const candMeta = `${rawCandTrack} ${item.albumName || ""}`;
  const candCleanTrack = normText(cleanQueryPart(rawCandTrack).replace(/^[^-]+-\s+/, ""));
  const candTrack = normText(rawCandTrack);
  const candArtist = normText(item.artistName || "");
  const candAlbum = normText(item.albumName || "");
  const nRaw = normText(rawTitle);

  if (nTrack && (candCleanTrack || candTrack)) {
    if (candCleanTrack === nTrack || candTrack === nTrack) score += 90;
    else if (candCleanTrack.includes(nTrack) || nTrack.includes(candCleanTrack)) score += 45;
    else score -= 80;
  }

  if (artist && candArtist) {
    const artistTokens = artist.split(/[,&x/]+/i).map(normText).filter((t) => t.length >= 2);
    const matched = artistTokens.some((tok) => candArtist.includes(tok) || tok.includes(candArtist));
    score += matched ? 55 : fromTitle ? -30 : -10;
  }

  if (targetDurSec && targetDurSec > 0 && typeof item.duration === "number" && item.duration > 0) {
    const diff = Math.abs(item.duration - targetDurSec);
    if (diff <= 3) score += 110;
    else if (diff <= 8) score += 75;
    else if (diff <= 15) score += 30;
    else if (diff <= 30) score -= 25;
    else score -= 140;
  }

  const rawIsMv = MV_TAG_RE.test(rawTitle);
  const candIsMv = MV_TAG_RE.test(candMeta);
  if (rawIsMv && candIsMv) score += 75;
  else if (!rawIsMv && candIsMv) score -= 60;

  if (hasSynced && parsedLines) {
    const uniqueTs = new Set(parsedLines.map((l) => Math.round(l.time * 10))).size;
    if (parsedLines.length < 4 || uniqueTs < 3) {
      score -= 120;
    } else {
      const lastTs = parsedLines[parsedLines.length - 1].time;
      if (typeof item.duration === "number" && item.duration > 0 && lastTs > item.duration + 10) {
        score -= 150;
      }
      if (targetDurSec && targetDurSec > 0 && lastTs > targetDurSec + 10) {
        score -= 140;
      }
    }
    const bilingualCount = parsedLines.filter((l) => /\S\^\S/.test(l.text)).length;
    if (bilingualCount >= 2) score -= 90;
  }

  for (const tagRe of VERSION_TAG_RES) {
    if ((tagRe.test(candTrack) || tagRe.test(candAlbum)) && !tagRe.test(nRaw)) score -= 100;
  }

  return score;
}

function parseLrc(raw: string): LyricLine[] {
  const offsetMatch = raw.match(/\[offset:\s*([+-]?\d+)\]/i);
  const offsetSec = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const lines: LyricLine[] = [];
  for (const row of raw.split(/\r?\n/)) {
    const matches = [...row.matchAll(/\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    const text = row.replace(/\[\d+:\d{2}(?:\.\d{1,3})?\]/g, "").trim();
    if (!text) continue;
    for (const m of matches) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const ms = m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0;
      lines.push({ time: Math.max(0, min * 60 + sec + ms - offsetSec), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export async function fetchTrackLyrics(
  title: string,
  channel: string,
  durationSec?: number
): Promise<LyricsResult | null> {
  const { artist, track, cleanTitle, fromTitle } = splitArtistTrack(title, channel);
  if (!track && !cleanTitle) return null;

  const targetDur = durationSec && durationSec > 0 ? Math.round(durationSec) : undefined;
  const candidates = new Map<number | string, any>();

  const addItems = (items: any[]) => {
    for (const item of items) {
      if (!item) continue;
      const key = item.id ?? `${item.trackName}-${item.artistName}-${item.duration}`;
      if (!candidates.has(key)) candidates.set(key, item);
    }
  };

  const getScore = (item: any, parsed?: LyricLine[]) => {
    const primary = scoreLyricCandidate(item, title, track, artist, fromTitle, targetDur, parsed);
    if (!fromTitle || !artist || !track) return primary;
    const swapped = scoreLyricCandidate(item, title, artist, track, true, targetDur, parsed);
    return Math.max(primary, swapped);
  };

  const primaryReqs: Promise<any>[] = [];
  if (artist && track && targetDur) {
    primaryReqs.push(
      fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}&duration=${targetDur}`,
        { cache: "no-store" }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  if (artist && track) {
    primaryReqs.push(
      fetch(
        `https://lrclib.net/api/search?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`,
        { cache: "no-store" }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    );
  }

  for (const res of await Promise.all(primaryReqs)) {
    addItems(Array.isArray(res) ? res : [res]);
  }

  const parsedCache = new Map<any, LyricLine[]>();
  const getParsed = (item: any) => {
    if (!parsedCache.has(item)) {
      parsedCache.set(item, item?.syncedLyrics ? parseLrc(item.syncedLyrics) : []);
    }
    return parsedCache.get(item)!;
  };

  const rankCandidates = () => {
    const scored = [...candidates.values()].map((item) => {
      const synced = getParsed(item);
      const ratio = nonLatinRatio(item, synced);
      return { item, synced, ratio, score: getScore(item, synced) };
    });
    const hasNativeNonLatin = scored.some((r) => r.score >= 160 && r.ratio >= 0.4);
    const wantsTranslation =
      /\b(romanized|romaji|romanization|pinyin|bilingual|translat(?:ed|ion)|terjemahan|traducción|traduccion|traduzione|übersetzung|(?:english|eng|indo(?:nesian)?|spanish|esp|japanese|jpn|korean|kor|chinese) (?:ver|version|trans))\b/i.test(
        title
      );
    if (hasNativeNonLatin && !wantsTranslation) {
      for (const r of scored) {
        if (r.ratio === 0) r.score -= 120;
        else r.score += Math.round(r.ratio * 40);
      }
    }
    return scored.sort((a, b) => b.score - a.score);
  };

  let ranked = rankCandidates();
  if (!ranked[0] || ranked[0].score < 210) {
    const fallbackUrls = [
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${track}`.trim())}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(track || cleanTitle)}`,
      fromTitle && artist && track
        ? `https://lrclib.net/api/search?track_name=${encodeURIComponent(artist)}&artist_name=${encodeURIComponent(track)}`
        : "",
    ].filter(Boolean);

    for (const url of fallbackUrls) {
      try {
        const list = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : []));
        if (Array.isArray(list)) addItems(list);
        ranked = rankCandidates();
        if (ranked[0] && ranked[0].score >= 220) break;
      } catch {
        continue;
      }
    }
  }

  const best = ranked[0];
  if (!best || best.score < 0) return null;

  const minVariantScore = Math.max(0, best.score - 60);
  const variants: LyricVariant[] = [];
  const seenSig = new Set<string>();
  for (const r of ranked) {
    if (r.score < minVariantScore || !r.synced.length) continue;
    const first = Math.round(r.synced[0].time * 2);
    const last = Math.round(r.synced[r.synced.length - 1].time * 2);
    const sig = `${first}:${last}:${r.synced.length}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    variants.push({
      synced: r.synced,
      plain: r.item.plainLyrics || "",
      trackName: r.item.trackName,
      artistName: r.item.artistName,
    });
    if (variants.length >= 4) break;
  }

  const primary = variants[0] || {
    synced: best.synced,
    plain: best.item.plainLyrics || "",
    trackName: best.item.trackName,
    artistName: best.item.artistName,
  };

  return {
    ...primary,
    variants: variants.length > 1 ? variants : undefined,
  };
}

