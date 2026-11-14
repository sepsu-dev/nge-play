// Shared InnerTube internals — deliberately NOT a "use server" module.
// Only this file's helpers may be imported by other server modules so that every
// exported symbol in youtube.ts stays a single-purpose Server Action.

export interface Track {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  duration: string;
  thumbnail: string;
  views?: string;
}

export const YTM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Origin: "https://music.youtube.com",
  Referer: "https://music.youtube.com/",
  "Accept-Language": "en-US,en;q=0.9",
};

// ponytail: 128px thumbnails — UI renders covers at 40-176px; 544px was ~15x the pixels/data
export const THUMB_SIZE = 128;
export const FALLBACK_THUMB = "mqdefault.jpg"; // 320x180 (~6KB) instead of hqdefault 480x360 (~36KB), same crop

export function sizeThumbUrl(url: string, size = THUMB_SIZE): string {
  return url.replace(/=w\d+-h\d+([^&\s]*)/i, `=w${size}-h${size}$1`);
}

export function walkObject(node: any, visitor: (obj: any) => void) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  if (Array.isArray(node)) {
    for (const item of node) walkObject(item, visitor);
  } else {
    for (const key of Object.keys(node)) walkObject(node[key], visitor);
  }
}

export function normalizeDuration(raw?: string): string {
  if (!raw) return "—";
  return /^\d+(\.\d{2})+$/.test(raw) ? raw.replace(/\./g, ":") : raw;
}

export type YtmPost = (
  endpoint: string,
  body: Record<string, any>,
  clientHint?: string
) => Promise<any | null>;

// ponytail: in-memory cache for track durations, capped at 1500 items
const DURATION_CACHE_MAX = 1500;
const durationCache = new Map<string, string>();

export async function hydrateTrackDurations<T extends Track>(
  tracks: T[],
  ytmPost: YtmPost
): Promise<T[]> {
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