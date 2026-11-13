import { NextRequest, NextResponse } from "next/server";
import type { RoomState } from "@/lib/room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RoomSubscriber {
  clientId: string;
}

interface RoomRecord {
  state: RoomState;
  subscribers: Map<string, RoomSubscriber>;
  hasJoined: boolean;
}

const PRESENCE_TTL_MS = 35_000;
const MAX_PRESENCE = 10_000;

const g = globalThis as typeof globalThis & {
  __ngePlayPresenceTimes?: Map<string, number>;
  __ngePlayRooms?: Map<string, RoomRecord>;
  __ngePlayPresenceListeners?: Set<(payload: string) => void>;
};

// ponytail: in-memory globalThis presence store — swap to Redis pub/sub for multi-instance serverless
const presenceTimes = (g.__ngePlayPresenceTimes ??= new Map<string, number>());
const rooms = (g.__ngePlayRooms ??= new Map<string, RoomRecord>());
const listeners = (g.__ngePlayPresenceListeners ??= new Set<(payload: string) => void>());

function prunePresence(now = Date.now()) {
  for (const [id, lastSeen] of presenceTimes) {
    if (now - lastSeen > PRESENCE_TTL_MS) {
      presenceTimes.delete(id);
    }
  }
}

function getPresenceSnapshot(now = Date.now()) {
  prunePresence(now);
  const activeRoomsCount = Array.from(rooms.values())
    .filter((r) => r.subscribers.size > 0).length;

  return {
    totalOnline: presenceTimes.size,
    totalRooms: activeRoomsCount,
  };
}

function broadcastPresence(now = Date.now()) {
  if (listeners.size === 0) return;
  const payload = `data: ${JSON.stringify(getPresenceSnapshot(now))}\n\n`;
  for (const send of listeners) {
    try {
      send(payload);
    } catch {}
  }
}

export async function GET(req: NextRequest) {
  const isSse = req.headers.get("accept")?.includes("text/event-stream");

  if (!isSse) {
    return NextResponse.json(getPresenceSnapshot());
  }

  const encoder = new TextEncoder();
  let closed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let sendFn: ((payload: string) => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendRaw = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (sendFn) {
          listeners.delete(sendFn);
        }
        try {
          controller.close();
        } catch {}
      };

      sendFn = (payload: string) => sendRaw(payload);
      listeners.add(sendFn);

      sendRaw(`data: ${JSON.stringify(getPresenceSnapshot())}\n\n`);

      pingTimer = setInterval(() => {
        if (closed) return;
        sendRaw(`data: ${JSON.stringify(getPresenceSnapshot())}\n\n`);
      }, 10_000);

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (sendFn) listeners.delete(sendFn);
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
  const now = Date.now();
  prunePresence(now);

  try {
    const body = await req.json();
    const rawId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    if (!rawId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const clientId = rawId.slice(0, 64);
    const isPlaying = Boolean(body.isPlaying);

    if (!isPlaying) {
      presenceTimes.delete(clientId);
      broadcastPresence(now);
      return NextResponse.json({ ok: true, isPlaying: false });
    }

    if (presenceTimes.size >= MAX_PRESENCE && !presenceTimes.has(clientId)) {
      const oldest = presenceTimes.keys().next().value;
      if (oldest) presenceTimes.delete(oldest);
    }
    presenceTimes.set(clientId, now);
    broadcastPresence(now);

    return NextResponse.json({ ok: true, totalOnline: presenceTimes.size });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}


