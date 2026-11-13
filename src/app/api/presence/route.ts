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
const PRUNE_INTERVAL_MS = 15_000;
const BROADCAST_DEBOUNCE_MS = 1_500;
const MAX_PRESENCE = 10_000;
const MAX_LISTENERS = 500;
const CLIENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

const g = globalThis as typeof globalThis & {
  __ngePlayPresenceTimes?: Map<string, number>;
  __ngePlayRooms?: Map<string, RoomRecord>;
  __ngePlayPresenceListeners?: Set<(payload: string) => void>;
};

// ponytail: in-memory globalThis presence store — swap to Redis pub/sub for multi-instance serverless
const presenceTimes = (g.__ngePlayPresenceTimes ??= new Map<string, number>());
const rooms = (g.__ngePlayRooms ??= new Map<string, RoomRecord>());
const listeners = (g.__ngePlayPresenceListeners ??= new Set<(payload: string) => void>());

let lastPruneAt = 0;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;

function prunePresence(now = Date.now()) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [id, lastSeen] of presenceTimes) {
    if (now - lastSeen > PRESENCE_TTL_MS) {
      presenceTimes.delete(id);
    }
  }
}

function getPresenceSnapshot(now = Date.now()) {
  prunePresence(now);
  const activeRooms = Array.from(rooms.values())
    .filter((r) => r.subscribers.size > 0);
  const totalRoomListeners = activeRooms.reduce((acc, r) => acc + r.subscribers.size, 0);

  return {
    totalOnline: presenceTimes.size,
    totalRooms: activeRooms.length,
    totalRoomListeners,
    serverTime: now,
  };
}

function scheduleBroadcast() {
  if (listeners.size === 0 || broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const payload = `data: ${JSON.stringify(getPresenceSnapshot())}\n\n`;
    for (const send of listeners) {
      try {
        send(payload);
      } catch {}
    }
  }, BROADCAST_DEBOUNCE_MS);
}

export async function GET(req: NextRequest) {
  const isSse = req.headers.get("accept")?.includes("text/event-stream");

  if (!isSse) {
    return NextResponse.json(getPresenceSnapshot());
  }

  if (listeners.size >= MAX_LISTENERS) {
    return new Response("Too many stream connections", { status: 503 });
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

      // Initial state
      sendRaw(`data: ${JSON.stringify(getPresenceSnapshot())}\n\n`);

      // Lightweight keep-alive comment ping (almost zero bandwidth)
      pingTimer = setInterval(() => {
        if (closed) return;
        sendRaw(": p\n\n");
      }, 25_000);

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
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const now = Date.now();
  prunePresence(now);

  try {
    const body = await req.json();
    const rawId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    if (!rawId || !CLIENT_ID_REGEX.test(rawId)) {
      return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
    }

    const clientId = rawId;
    const isPlaying = Boolean(body.isPlaying);

    if (!isPlaying) {
      presenceTimes.delete(clientId);
      scheduleBroadcast();
      return NextResponse.json({ ok: true, isPlaying: false });
    }

    if (presenceTimes.size >= MAX_PRESENCE && !presenceTimes.has(clientId)) {
      const oldest = presenceTimes.keys().next().value;
      if (oldest) presenceTimes.delete(oldest);
    }
    presenceTimes.set(clientId, now);
    scheduleBroadcast();

    return NextResponse.json({ ok: true, totalOnline: presenceTimes.size });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}



