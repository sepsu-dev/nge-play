import { NextRequest, NextResponse } from "next/server";
import type { Track } from "@/actions/youtube";
import {
  applyRoomCommand,
  createRoomState,
  generateMemberIcon,
  generateMemberName,
  makeRoomCode,
  parseMemberIcon,
  sanitizeMemberName,
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
}

const ROOM_PENDING_TTL_MS = 15_000;
const ROOM_IDLE_TTL_MS = 6 * 3600_000;
const MAX_USED_CODES = 50_000;
const MAX_ACTIVE_ROOMS = 1_000;

const g = globalThis as typeof globalThis & {
  __ngePlayRooms?: Map<string, RoomRecord>;
  __ngePlayUsedRoomCodes?: Set<string>;
};
// ponytail: in-memory globalThis room store for single-node dev/VPS — swap to Redis/Pusher/PartyKit for multi-instance serverless
const rooms = (g.__ngePlayRooms ??= new Map<string, RoomRecord>());
const usedCodes = (g.__ngePlayUsedRoomCodes ??= new Set<string>());

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

export async function GET(req: NextRequest) {
  pruneRooms();

  const code = sanitizeRoomCode(req.nextUrl.searchParams.get("code") || "");
  const clientId = (req.nextUrl.searchParams.get("clientId") || "anon").slice(0, 64);
  const name =
    sanitizeMemberName(req.nextUrl.searchParams.get("name") || "") || generateMemberName();
  const icon = parseMemberIcon(req.nextUrl.searchParams.get("icon")) || generateMemberIcon();
  const rec = rooms.get(code);
  if (!rec) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
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
    rec.subscribers.delete(subId);
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = Date.now();
  const clientId = String(body?.clientId || "anon").slice(0, 64);

  if (body?.type === "create") {
    if (rooms.size >= MAX_ACTIVE_ROOMS) {
      return NextResponse.json({ error: "Room limit reached" }, { status: 429 });
    }
    const code = makeRoomCode({
      has: (c) => rooms.has(c) || usedCodes.has(c),
    });
    rememberUsedCode(code);
    const queue = Array.isArray(body.queue)
      ? (body.queue.filter((t: any) => t && typeof t.id === "string" && t.id.length < 64).slice(0, 60) as Track[])
      : [];
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
    rooms.set(code, { state, subscribers: new Map(), hasJoined: false });
    return NextResponse.json({ room: state, serverNow: now });
  }

  const code = sanitizeRoomCode(String(body?.code || ""));
  const rec = rooms.get(code);
  if (!rec) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (body?.type === "join") {
    rec.state = { ...rec.state, lastActivityAt: now };
    return NextResponse.json({ room: rec.state, serverNow: now });
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

