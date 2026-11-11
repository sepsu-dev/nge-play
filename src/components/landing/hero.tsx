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

const YT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "SOCS=CAI",
};

// ponytail: regex + ytInitialData parse — upgrade to YouTube Data API v3 only if rate-limited at scale
function normalizeDuration(raw?: string): string {
  if (!raw) return "LIVE";
  return /^\d+(\.\d{2})+$/.test(raw) ? raw.replace(/\./g, ":") : raw;
}

function extractVideoId(input: string): string | null {
  const match = input.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  return null;
}

function extractPlaylistId(input: string): string | null {
  const match = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function fetchYtInitialData(url: string): Promise<any | null> {
  try {
    const html = await fetch(url, { headers: YT_HEADERS, cache: "no-store" }).then((r) => r.text());
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    return match ? JSON.parse(match[1]) : null;
  } catch {
    return null;
  }
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

function collectPlaylistTracks(data: any, limit = 30): Track[] {
  const seen = new Set<string>();
  const tracks: Track[] = [];
  walkObject(data, (o) => {
    if (tracks.length >= limit) return;
    const p = o?.playlistPanelVideoRenderer || o?.playlistVideoRenderer;
    if (!p?.videoId || seen.has(p.videoId)) return;
    seen.add(p.videoId);
    tracks.push({
      id: p.videoId,
      title: p.title?.simpleText || p.title?.runs?.[0]?.text || "Untitled",
      channel:
        p.shortBylineText?.runs?.[0]?.text ||
        p.longBylineText?.runs?.[0]?.text ||
        "YouTube Music",
      channelId:
        findBrowseId(p.shortBylineText) ||
        findBrowseId(p.longBylineText) ||
        findBrowseId(p),
      duration: normalizeDuration(p?.lengthText?.simpleText),
      thumbnail: `https://i.ytimg.com/vi/${p.videoId}/hqdefault.jpg`,
    });
  });
  return tracks;
}

export async function fetchYouTubeExplore(playlistId?: string): Promise<{
  playlists: YouTubePlaylist[];
  activePlaylistId: string;
  activeTitle: string;
  tracks: Track[];
}> {
  const channelData = await fetchYtInitialData(
    "https://www.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"
  );

  const seenPl = new Set<string>();
  const playlists: YouTubePlaylist[] = [];
  walkObject(channelData, (o) => {
    const l = o?.lockupViewModel;
    if (l?.contentType !== "LOCKUP_CONTENT_TYPE_PLAYLIST" || !l?.contentId || seenPl.has(l.contentId)) {
      return;
    }
    const title = l.metadata?.lockupMetadataViewModel?.title?.content;
    if (!title) return;
    seenPl.add(l.contentId);
    playlists.push({ id: l.contentId, title });
  });

  const selected =
    playlists.find((p) => p.id === playlistId) ||
    playlists[0] ||
    (playlistId ? { id: playlistId, title: "YouTube Music" } : null);

  if (!selected) {
    return { playlists: [], activePlaylistId: "", activeTitle: "YouTube Music", tracks: [] };
  }

  const listData = await fetchYtInitialData(
    `https://www.youtube.com/watch?list=${encodeURIComponent(selected.id)}`
  );
  const tracks = collectPlaylistTracks(listData, 30);

  return {
    playlists: playlists.slice(0, 8),
    activePlaylistId: selected.id,
    activeTitle: selected.title,
    tracks,
  };
}

export async function searchYouTube(query: string): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  const listId = extractPlaylistId(q);
  const directId = extractVideoId(q);
  if (listId && !directId) {
    const listData = await fetchYtInitialData(
      `https://www.youtube.com/watch?list=${encodeURIComponent(listId)}`
    );
    const items = collectPlaylistTracks(listData, 30);
    if (items.length) return items;
  }

  if (directId) {
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directId}&format=json`
      ).then((r) => (r.ok ? r.json() : null));

      const handleMatch = oembed?.author_url?.match(/youtube\.com\/(@[\w.-]+|channel\/(UC[\w-]+))/i);
      return [
        {
          id: directId,
          title: oembed?.title || `YouTube Track (${directId})`,
          channel: oembed?.author_name || "YouTube",
          channelId: handleMatch ? handleMatch[2] || handleMatch[1] : undefined,
          duration: "LINK",
          thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
        },
      ];
    } catch {
      return [
        {
          id: directId,
          title: `YouTube Track (${directId})`,
          channel: "YouTube",
          duration: "LINK",
          thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
        },
      ];
    }
  }

  const data = await fetchYtInitialData(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`
  );
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents || [];

  const tracks: Track[] = [];
  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v?.videoId) continue;

      const duration = v?.lengthText?.simpleText;
      if (!duration) continue;

      tracks.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || "Untitled",
        channel:
          v.ownerText?.runs?.[0]?.text ||
          v.longBylineText?.runs?.[0]?.text ||
          "YouTube",
        channelId:
          v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
          v.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
        duration: normalizeDuration(duration),
        views: v.shortViewCountText?.simpleText,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      });

      if (tracks.length >= 24) break;
    }
    if (tracks.length >= 24) break;
  }

  return tracks;
}

export async function resolveChannelFromVideo(videoId: string): Promise<string | null> {
  if (!videoId) return null;
  try {
    const html = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      { headers: YT_HEADERS, cache: "no-store" }
    ).then((r) => r.text());
    const direct =
      html.match(/"externalChannelId":"(UC[\w-]+)"/)?.[1] ||
      html.match(/"channelId":"(UC[\w-]+)"/)?.[1] ||
      html.match(/videoOwnerRenderer[\s\S]{0,600}"browseId":"(UC[\w-]+)"/)?.[1];
    return direct || null;
  } catch {
    return null;
  }
}

function parseChannelGridItems(items: any[], channelTitle: string, channelId: string) {
  const seen = new Set<string>();
  const tracks: Track[] = [];
  let continuation: string | undefined;

  for (const item of items) {
    const token = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (token) {
      continuation = token;
      continue;
    }

    const lvm = item?.richItemRenderer?.content?.lockupViewModel;
    if (lvm?.contentId && !seen.has(lvm.contentId)) {
      const badge =
        lvm.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel
          ?.badges?.[0]?.thumbnailBadgeViewModel?.text;
      seen.add(lvm.contentId);
      const rows = lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
      const views = rows[0]?.metadataParts?.[0]?.text?.content;
      tracks.push({
        id: lvm.contentId,
        title: lvm.metadata?.lockupMetadataViewModel?.title?.content || "Untitled",
        channel: channelTitle,
        channelId,
        duration: normalizeDuration(badge),
        views,
        thumbnail: `https://i.ytimg.com/vi/${lvm.contentId}/hqdefault.jpg`,
      });
      continue;
    }

    const v = item?.richItemRenderer?.content?.videoRenderer;
    if (v?.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      tracks.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || "Untitled",
        channel: channelTitle,
        channelId,
        duration: normalizeDuration(v.lengthText?.simpleText),
        views: v.shortViewCountText?.simpleText,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      });
    }
  }

  return { tracks, continuation };
}

export async function fetchYouTubeChannel(
  channelId: string,
  continuation?: string,
  apiKey?: string,
  knownTitle?: string
): Promise<ChannelVideosResult | null> {
  if (!channelId) return null;

  try {
    if (continuation && apiKey) {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { ...YT_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: { clientName: "WEB", clientVersion: "2.20240501.00.00", hl: "en", gl: "US" } },
            continuation,
          }),
          cache: "no-store",
        }
      ).then((r) => r.json());

      const items = res?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems || [];
      const parsed = parseChannelGridItems(items, knownTitle || "Channel", channelId);
      return {
        channel: { id: channelId, title: knownTitle || "Channel" },
        tracks: parsed.tracks,
        continuation: parsed.continuation,
        apiKey,
      };
    }

    const url = channelId.startsWith("@")
      ? `https://www.youtube.com/${channelId}/videos?hl=en`
      : `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/videos?hl=en`;
    const html = await fetch(url, { headers: YT_HEADERS, cache: "no-store" }).then((r) => r.text());
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    const hdr = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
    const title =
      hdr?.title?.dynamicTextViewModel?.text?.content ||
      data?.metadata?.channelMetadataRenderer?.title ||
      knownTitle ||
      "Channel";
    const resolvedId = data?.metadata?.channelMetadataRenderer?.externalId || channelId;
    const metaRows = hdr?.metadata?.contentMetadataViewModel?.metadataRows || [];
    const handle = metaRows[0]?.metadataParts?.[0]?.text?.content;
    const subscribers = metaRows[1]?.metadataParts?.[0]?.text?.content;
    const videoCount = metaRows[1]?.metadataParts?.[1]?.text?.content;
    const avatar =
      hdr?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources?.slice(-1)[0]?.url ||
      data?.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url;

    const tab = (data?.contents?.twoColumnBrowseResultsRenderer?.tabs || []).find(
      (t: any) => t.tabRenderer?.selected
    )?.tabRenderer;
    const items = tab?.content?.richGridRenderer?.contents || [];
    const parsed = parseChannelGridItems(items, title, resolvedId);

    return {
      channel: { id: resolvedId, title, handle, avatar, subscribers, videoCount },
      tracks: parsed.tracks,
      continuation: parsed.continuation,
      apiKey: key,
    };
  } catch {
    return null;
  }
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

