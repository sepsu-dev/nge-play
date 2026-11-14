import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Track } from "@/actions/ytm-core";
import {
  applyRoomCommand,
  createRoomState,
  generateMemberIcon,
  generateMemberName,
  makeRoomCode,
  parseMemberIcon,
  sanitizeMemberName,
  sanitizeQueue,
  sanitizeRoomCode,
  type MemberIconId,
  type RoomCommand,
  type RoomMember,
  type RoomState,
} from "@/lib/room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RoomSubscriber {
  clientId: string;
  name: string;
  icon: MemberIconId;
  send: (event: string, data: unknown) => void;
  close: () => void;
}

interface RoomRecord {
  state: RoomState;
  subscribers: Map<string, RoomSubscriber>;
  hasJoined: boolean;
  /** clientId -> token rahasia per member; mencegah spoofing identitas. */
  tokens: Map<string, string>;
}

const ROOM_PENDING_TTL_MS = 15_000;
const ROOM_IDLE_TTL_MS = 6 * 3600_000;
const MAX_USED_CODES = 50_000;
const MAX_ACTIVE_ROOMS = 1_000;
const MAX_SUBS_PER_ROOM = 20;
const MAX_TOTAL_SUBS = 2_000;
const MAX_TOKENS_PER_ROOM = 100;
const MAX_BODY_BYTES = 256 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_POST = 180;
const RATE_CREATE = 10;
const RATE_JOIN = 30;
const RATE_GET = 120;
const MAX_RATE_KEYS = 20_000;

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const g = globalThis as typeof globalThis & {
  __ngePlayRooms?: Map<string, RoomRecord>;
  __ngePlayUsedRoomCodes?: Set<string>;
  __ngePlaySubCount?: number;
  __ngePlayRateBuckets?: Map<string, { count: number; resetAt: number }>;
};
// ponytail: in-memory globalThis room store for single-node dev/VPS — swap to Redis/Pusher/PartyKit for multi-instance serverless
const rooms = (g.__ngePlayRooms ??= new Map<string, RoomRecord>());
const usedCodes = (g.__ngePlayUsedRoomCodes ??= new Set<string>());
const rateBuckets = (g.__ngePlayRateBuckets ??= new Map<string, { count: number; resetAt: number }>());

function rememberUsedCode(code: string) {
  if (usedCodes.size >= MAX_USED_CODES) {
    const oldest = usedCodes.values().next().value;
    if (oldest) usedCodes.delete(oldest);
  }
  usedCodes.add(code);
}

function pruneRooms(now = Date.now()) {
  for (const [code, rec] of rooms) {
    const unjoinedExpired = !rec.hasJoined && now - rec.state.createdAt > ROOM_PENDING_TTL_MS;
    const idleExpired = now - rec.state.lastActivityAt > ROOM_IDLE_TTL_MS;
    if (unjoinedExpired || idleExpired) {
      // Tutup SSE yang masih menempel supaya tidak jadi kebocoran koneksi/memori.
      for (const sub of [...rec.subscribers.values()]) sub.close();
      rooms.delete(code);
    }
  }
}

function buildMembers(rec: RoomRecord): RoomMember[] {
  const byId = new Map<string, RoomMember>();
  for (const sub of rec.subscribers.values()) {
    byId.set(sub.clientId, { id: sub.clientId, name: sub.name, icon: sub.icon });
  }
  return Array.from(byId.values());
}

function broadcastRoom(rec: RoomRecord, now = Date.now(), excludeSubId?: string) {
  const payload = { room: rec.state, serverNow: now };
  for (const [subId, sub] of rec.subscribers) {
    if (subId === excludeSubId) continue;
    sub.send("state", payload);
  }
}

/** IP hanya dipakai untuk rate limit — bukan identitas/auth. */
function requestIp(req: NextRequest): string {
  const raw =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
    "";
  const ip = raw.trim();
  return isIP(ip) ? ip : "unknown";
}

function allowRate(key: string, limit: number, now = Date.now()): boolean {
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (rateBuckets.size >= MAX_RATE_KEYS) rateBuckets.clear();
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // curl / same-origin tanpa Origin
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

function parseClientId(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return CLIENT_ID_RE.test(value) ? value : null;
}

function tokenMatches(rec: RoomRecord, clientId: string, token: unknown): boolean {
  const expected = rec.tokens.get(clientId);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

function issueToken(rec: RoomRecord, clientId: string): string {
  // Batasi jumlah token per room supaya tidak tumbuh tanpa batas.
  if (!rec.tokens.has(clientId) && rec.tokens.size >= MAX_TOKENS_PER_ROOM) {
    const oldest = rec.tokens.keys().next().value;
    if (oldest) rec.tokens.delete(oldest);
  }
  const token = randomBytes(24).toString("base64url");
  rec.tokens.set(clientId, token);
  return token;
}

class BodyTooLarge extends Error {}

async function readJsonBody(req: NextRequest): Promise<{ body?: any; error?: NextResponse }> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: NextResponse.json({ error: "Payload too large" }, { status: 413 }) };
  }
  if (!req.body) {
    return { error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new BodyTooLarge();
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    if (err instanceof BodyTooLarge) {
      return { error: NextResponse.json({ error: "Payload too large" }, { status: 413 }) };
    }
    return { error: NextResponse.json({ error: "Invalid body" }, { status: 400 }) };
  }

  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}

export async function GET(req: NextRequest) {
  pruneRooms();

  const now = Date.now();
  const ip = requestIp(req);
  if (!allowRate(`get:${ip}`, RATE_GET, now)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const code = sanitizeRoomCode(req.nextUrl.searchParams.get("code") || "");
  if (!code) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });

  const clientId = parseClientId(req.nextUrl.searchParams.get("clientId"));
  if (!clientId) return NextResponse.json({ error: "Invalid client id" }, { status: 400 });

  const token = req.nextUrl.searchParams.get("token") || "";
  const name =
    sanitizeMemberName(req.nextUrl.searchParams.get("name") || "") || generateMemberName();
  const icon = parseMemberIcon(req.nextUrl.searchParams.get("icon")) || generateMemberIcon();
  const rec = rooms.get(code);
  if (!rec) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (!tokenMatches(rec, clientId, token)) {
    return NextResponse.json({ error: "Invalid room token" }, { status: 403 });
  }
  if (rec.subscribers.size >= MAX_SUBS_PER_ROOM) {
    return NextResponse.json({ error: "Room is full" }, { status: 429 });
  }
  if ((g.__ngePlaySubCount || 0) >= MAX_TOTAL_SUBS) {
    return NextResponse.json({ error: "Server busy" }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const subId = `${clientId}_${Math.random().toString(36).slice(2, 8)}`;
  let closed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const detach = () => {
    if (closed) return;
    closed = true;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (rec.subscribers.delete(subId)) {
      g.__ngePlaySubCount = Math.max(0, (g.__ngePlaySubCount || 1) - 1);
    }
    const members = buildMembers(rec);
    if (members.length === 0) {
      rooms.delete(code);
      return;
    }
    const now = Date.now();
    rec.state = { ...rec.state, members, memberCount: members.length };
    broadcastRoom(rec, now);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        detach();
        try {
          controller.close();
        } catch {}
      };

      rec.subscribers.set(subId, { clientId, name, icon, send, close: cleanup });
      g.__ngePlaySubCount = (g.__ngePlaySubCount || 0) + 1;
      rec.hasJoined = true;
      const now = Date.now();
      const members = buildMembers(rec);
      rec.state = { ...rec.state, members, memberCount: Math.max(1, members.length) };

      send("state", { room: rec.state, serverNow: now });
      broadcastRoom(rec, now, subId);

      pingTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 20_000);

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      detach();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest) {
  pruneRooms();

  const now = Date.now();
  const ip = requestIp(req);
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  if (!allowRate(`post:${ip}`, RATE_POST, now)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = await readJsonBody(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  const clientId = parseClientId(body?.clientId);
  if (!clientId) return NextResponse.json({ error: "Invalid client id" }, { status: 400 });

  if (body?.type === "create") {
    if (!allowRate(`create:${ip}`, RATE_CREATE, now)) {
      return NextResponse.json({ error: "Too many rooms" }, { status: 429 });
    }
    if (rooms.size >= MAX_ACTIVE_ROOMS) {
      return NextResponse.json({ error: "Room limit reached" }, { status: 429 });
    }
    const code = makeRoomCode({
      has: (c) => rooms.has(c) || usedCodes.has(c),
    });
    rememberUsedCode(code);
    const queue = sanitizeQueue(body.queue);
    const clientName = sanitizeMemberName(String(body?.name || "")) || generateMemberName();
    const clientIcon = parseMemberIcon(body?.icon) || generateMemberIcon();
    const state = createRoomState({
      code,
      clientId,
      clientName,
      clientIcon,
      queue,
      currentIndex: Number(body.currentIndex) || 0,
      currentTime: Number(body.currentTime) || 0,
      isPlaying: Boolean(body.isPlaying),
      lyricVariantIdx: Number(body.lyricVariantIdx) || 0,
      lyricOffset: Number(body.lyricOffset) || 0,
      now,
    });
    const rec: RoomRecord = {
      state,
      subscribers: new Map(),
      hasJoined: false,
      tokens: new Map(),
    };
    const token = issueToken(rec, clientId);
    rooms.set(code, rec);
    return NextResponse.json({ room: state, serverNow: now, token });
  }

  const code = sanitizeRoomCode(String(body?.code || ""));
  if (!code) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const rec = rooms.get(code);
  if (!rec) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (body?.type === "join") {
    if (!allowRate(`join:${ip}`, RATE_JOIN, now)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const token = typeof body?.token === "string" ? body.token : "";
    let memberToken: string;
    if (rec.tokens.has(clientId)) {
      if (!tokenMatches(rec, clientId, token)) {
        return NextResponse.json({ error: "Invalid room token" }, { status: 403 });
      }
      memberToken = token;
    } else {
      memberToken = issueToken(rec, clientId);
    }
    rec.state = { ...rec.state, lastActivityAt: now };
    return NextResponse.json({ room: rec.state, serverNow: now, token: memberToken });
  }

  // Semua aksi setelah join wajib menyertakan token milik clientId tersebut.
  if (!tokenMatches(rec, clientId, body?.token)) {
    return NextResponse.json({ error: "Invalid room token" }, { status: 403 });
  }

  if (body?.type === "rename") {
    const hasName = body?.name !== undefined;
    const hasIcon = body?.icon !== undefined;
    const nextName = hasName ? sanitizeMemberName(String(body.name || "")) : "";
    const nextIcon = hasIcon ? parseMemberIcon(body.icon) : null;
    if ((hasName && !nextName) || (hasIcon && !nextIcon) || (!hasName && !hasIcon)) {
      return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    }
    let updated = false;
    for (const sub of rec.subscribers.values()) {
      if (sub.clientId === clientId) {
        if (nextName) sub.name = nextName;
        if (nextIcon) sub.icon = nextIcon;
        updated = true;
      }
    }
    const members = updated
      ? buildMembers(rec)
      : rec.state.members.map((m) =>
          m.id === clientId
            ? { ...m, name: nextName || m.name, icon: nextIcon || m.icon }
            : m
        );
    rec.state = {
      ...rec.state,
      members,
      memberCount: Math.max(1, members.length),
      lastActivityAt: now,
    };
    broadcastRoom(rec, now);
    return NextResponse.json({ room: rec.state, serverNow: now });
  }

  if (body?.type === "leave") {
    let removedSub = false;
    for (const sub of rec.subscribers.values()) {
      if (sub.clientId === clientId) {
        removedSub = true;
        sub.close();
      }
    }
    rec.tokens.delete(clientId);
    const members = buildMembers(rec);
    if (members.length === 0) {
      rooms.delete(code);
    } else if (!removedSub) {
      rec.state = { ...rec.state, members, memberCount: members.length };
      broadcastRoom(rec, now);
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.type === "command" && body.command && typeof body.command.type === "string") {
    const result = applyRoomCommand(rec.state, body.command as RoomCommand, clientId, now);
    if (result.changed) {
      const members = buildMembers(rec);
      rec.state = {
        ...result.room,
        members: members.length ? members : result.room.members,
        memberCount: Math.max(1, members.length || result.room.memberCount),
      };
      broadcastRoom(rec, now);
    }
    return NextResponse.json({ room: rec.state, serverNow: now, changed: result.changed });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
