import { NextRequest, NextResponse } from "next/server";
import type Innertube from "youtubei.js";
import { getInnertube } from "@/lib/innertube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const CLIENTS = ["MWEB", "YTMUSIC", "IOS", "ANDROID", "WEB"] as const;
const MAX_OPEN_CHUNK = 2 * 1024 * 1024;

interface ResolvedStream {
  url: string;
  mimeType: string;
  contentLength?: number;
  expiresAt: number;
}

const g = globalThis as typeof globalThis & {
  __streamCache?: Map<string, ResolvedStream>;
};

const streamCache = (g.__streamCache ??= new Map<string, ResolvedStream>());

function parseExpireMs(url: string): number {
  try {
    const exp = Number(new URL(url).searchParams.get("expire"));
    if (Number.isFinite(exp) && exp > 0) {
      return Math.min(Date.now() + 10 * 60_000, exp * 1000 - 60_000);
    }
  } catch {}
  return Date.now() + 10 * 60_000;
}

function tryChoose(
  info: Awaited<ReturnType<Innertube["getBasicInfo"]>>,
  options: Parameters<typeof info.chooseFormat>[0]
) {
  try {
    const fmt = info.chooseFormat(options);
    return fmt.url || fmt.signature_cipher || fmt.cipher ? fmt : null;
  } catch {
    return null;
  }
}

// ponytail: probe last byte on adaptive audio to catch po_token 403 and fall back to ANDROID itag 18
async function probeStream(
  url: string,
  knownLength: number | undefined,
  adaptiveAudio: boolean
): Promise<{ contentLength?: number } | null> {
  const probeAt = async (offset: number) =>
    fetch(url, {
      headers: { Range: `bytes=${offset}-${offset}` },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

  try {
    const offset = adaptiveAudio ? (knownLength ? knownLength - 1 : MAX_OPEN_CHUNK - 1) : 0;
    let res = await probeAt(offset);
    if (res.status === 416 && offset > 0) {
      void res.body?.cancel().catch(() => {});
      res = await probeAt(0);
    }
    void res.body?.cancel().catch(() => {});
    if (!res.ok && res.status !== 206) return null;

    const totalMatch = res.headers.get("content-range")?.match(/\/(\d+)$/);
    const parsedTotal = totalMatch ? Number(totalMatch[1]) : undefined;
    return {
      contentLength: knownLength || (Number.isFinite(parsedTotal) ? parsedTotal : undefined),
    };
  } catch {
    return null;
  }
}

async function resolveStream(videoId: string, forceRefresh = false): Promise<ResolvedStream> {
  if (!forceRefresh) {
    const cached = streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return cached;
  }

  const yt = await getInnertube();
  let lastErr: unknown;

  for (const client of CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const fmt =
        tryChoose(info, { type: "audio", format: "mp4", quality: "best" }) ||
        tryChoose(info, { type: "audio", quality: "best" }) ||
        tryChoose(info, { type: "video+audio", format: "mp4", quality: "360p" });
      if (!fmt) continue;

      const url = await fmt.decipher(yt.session.player);
      if (!url) continue;

      const rawLen = Number(fmt.content_length);
      const knownLen = Number.isFinite(rawLen) && rawLen > 0 ? rawLen : undefined;
      const probed = await probeStream(url, knownLen, !fmt.has_video);
      if (!probed) continue;

      const resolved: ResolvedStream = {
        url,
        mimeType: (fmt.mime_type || "audio/mp4").split(";")[0],
        contentLength: probed.contentLength,
        expiresAt: parseExpireMs(url),
      };
      if (streamCache.size >= 200) streamCache.clear();
      streamCache.set(videoId, resolved);
      return resolved;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("No playable audio stream found");
}

function buildUpstreamRange(rangeHeader: string | null, total?: number): string | null {
  if (!rangeHeader) return null;
  const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/i);
  if (!m) return rangeHeader;

  const start = Number(m[1]);
  if (total && start >= total) return "INVALID";
  if (m[2]) return `bytes=${start}-${total ? Math.min(Number(m[2]), total - 1) : Number(m[2])}`;

  const end = total ? Math.min(start + MAX_OPEN_CHUNK - 1, total - 1) : start + MAX_OPEN_CHUNK - 1;
  return `bytes=${start}-${end}`;
}

export async function HEAD(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!VIDEO_ID_RE.test(id)) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });

  try {
    const stream = await resolveStream(id);
    const headers: Record<string, string> = {
      "Content-Type": stream.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };
    if (stream.contentLength) headers["Content-Length"] = String(stream.contentLength);
    return new NextResponse(null, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Stream unavailable" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!VIDEO_ID_RE.test(id)) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });

  const rangeHeader = req.headers.get("range");

  for (let attempt = 0; attempt < 2; attempt++) {
    let stream: ResolvedStream;
    try {
      stream = await resolveStream(id, attempt > 0);
    } catch {
      return NextResponse.json({ error: "Stream unavailable" }, { status: 502 });
    }

    const upstreamRange = buildUpstreamRange(rangeHeader, stream.contentLength);
    if (upstreamRange === "INVALID") {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stream.contentLength}` },
      });
    }

    let upstream: Response;
    try {
      upstream = await fetch(stream.url, {
        headers: upstreamRange ? { Range: upstreamRange } : {},
        signal: req.signal,
        cache: "no-store",
      });
    } catch {
      if (req.signal.aborted) return new NextResponse(null, { status: 499 });
      continue;
    }

    if ((upstream.status === 403 || upstream.status === 410) && attempt === 0) {
      streamCache.delete(id);
      continue;
    }
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: "Upstream stream failed" }, { status: 502 });
    }

    const resHeaders = new Headers({
      "Content-Type": (upstream.headers.get("content-type") || stream.mimeType).split(";")[0],
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    if (cl) resHeaders.set("Content-Length", cl);
    if (cr) resHeaders.set("Content-Range", cr);

    return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
  }

  return NextResponse.json({ error: "Stream unavailable" }, { status: 502 });
}
