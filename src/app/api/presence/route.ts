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
};

const presenceTimes = (g.__ngePlayPresenceTimes ??= new Map<string, number>());
const rooms = (g.__ngePlayRooms ??= new Map<string, RoomRecord>());

function prunePresence(now = Date.now()) {
  for (const [id, lastSeen] of presenceTimes) {
    if (now - lastSeen > PRESENCE_TTL_MS) {
      presenceTimes.delete(id);
    }
  }
}

export async function GET() {
  const now = Date.now();
  prunePresence(now);

  const activeRoomsCount = Array.from(rooms.values())
    .filter((r) => r.subscribers.size > 0).length;

  return NextResponse.json({
    totalOnline: presenceTimes.size,
    totalRooms: activeRoomsCount,
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
      return NextResponse.json({ ok: true, isPlaying: false });
    }

    if (presenceTimes.size >= MAX_PRESENCE && !presenceTimes.has(clientId)) {
      const oldest = presenceTimes.keys().next().value;
      if (oldest) presenceTimes.delete(oldest);
    }
    presenceTimes.set(clientId, now);
    return NextResponse.json({ ok: true, totalOnline: presenceTimes.size });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

