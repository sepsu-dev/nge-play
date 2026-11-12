import type { Track } from "@/actions/youtube";

export interface RoomState {
  code: string;
  version: number;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  anchorTime: number;
  anchorAt: number;
  updatedBy: string;
  memberCount: number;
  createdAt: number;
  lastActivityAt: number;
}

export type RoomCommand =
  | { type: "play"; atTime?: number }
  | { type: "pause"; atTime?: number }
  | { type: "seek"; toTime: number }
  | { type: "setTrack"; index: number; queue?: Track[]; autoPlay?: boolean }
  | { type: "next"; shuffle?: boolean; baseVersion?: number }
  | { type: "prev"; atTime?: number }
  | { type: "clearQueue" };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function sanitizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function makeRoomCode(existing?: { has: (code: string) => boolean }): string {
  for (const len of [6, 7, 8]) {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "";
      for (let i = 0; i < len; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!existing?.has(code)) return code;
    }
  }
  while (true) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    if (code.length >= 6 && !existing?.has(code)) return code;
  }
}

export function computeRoomTime(
  room: Pick<RoomState, "isPlaying" | "anchorTime" | "anchorAt">,
  serverNow: number
): number {
  if (!room.isPlaying) return Math.max(0, room.anchorTime);
  const elapsed = Math.max(0, serverNow - room.anchorAt) / 1000;
  return Math.max(0, room.anchorTime + elapsed);
}

export function createRoomState(params: {
  code: string;
  clientId: string;
  queue: Track[];
  currentIndex: number;
  currentTime: number;
  isPlaying: boolean;
  now?: number;
}): RoomState {
  const now = params.now ?? Date.now();
  const queue = params.queue.slice(0, 60);
  const maxIdx = Math.max(0, queue.length - 1);
  const currentIndex = Math.min(Math.max(0, params.currentIndex), maxIdx);
  const anchorTime = Math.max(0, Number.isFinite(params.currentTime) ? params.currentTime : 0);

  return {
    code: params.code,
    version: 1,
    queue,
    currentIndex,
    isPlaying: queue.length > 0 && params.isPlaying,
    anchorTime,
    anchorAt: now,
    updatedBy: params.clientId,
    memberCount: 1,
    createdAt: now,
    lastActivityAt: now,
  };
}

export function applyRoomCommand(
  room: RoomState,
  command: RoomCommand,
  clientId: string,
  now = Date.now()
): { room: RoomState; changed: boolean } {
  if (
    command.type === "next" &&
    typeof command.baseVersion === "number" &&
    command.baseVersion !== room.version
  ) {
    return { room, changed: false };
  }

  if (command.type === "setTrack") {
    const nextQueue = command.queue ? command.queue.slice(0, 60) : room.queue;
    if (!nextQueue.length) return { room, changed: false };
    const idx = Math.min(Math.max(0, command.index), nextQueue.length - 1);
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        queue: nextQueue,
        currentIndex: idx,
        isPlaying: command.autoPlay ?? true,
        anchorTime: 0,
        anchorAt: now,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  if (!room.queue.length) return { room, changed: false };

  if (command.type === "play" || command.type === "pause") {
    const at = Math.max(
      0,
      typeof command.atTime === "number" && Number.isFinite(command.atTime)
        ? command.atTime
        : computeRoomTime(room, now)
    );
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        isPlaying: command.type === "play",
        anchorTime: at,
        anchorAt: now,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  if (command.type === "seek") {
    const to = Math.max(0, Number.isFinite(command.toTime) ? command.toTime : 0);
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        anchorTime: to,
        anchorAt: now,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  if (command.type === "next") {
    let idx = (room.currentIndex + 1) % room.queue.length;
    if (command.shuffle && room.queue.length > 1) {
      idx = Math.floor(Math.random() * room.queue.length);
      if (idx === room.currentIndex) idx = (idx + 1) % room.queue.length;
    }
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        currentIndex: idx,
        isPlaying: true,
        anchorTime: 0,
        anchorAt: now,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  if (command.type === "prev") {
    const pos =
      typeof command.atTime === "number" && Number.isFinite(command.atTime)
        ? command.atTime
        : computeRoomTime(room, now);
    if (pos > 4) {
      return {
        changed: true,
        room: {
          ...room,
          version: room.version + 1,
          anchorTime: 0,
          anchorAt: now,
          updatedBy: clientId,
          lastActivityAt: now,
        },
      };
    }
    const idx = (room.currentIndex - 1 + room.queue.length) % room.queue.length;
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        currentIndex: idx,
        isPlaying: true,
        anchorTime: 0,
        anchorAt: now,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  if (command.type === "clearQueue") {
    const cur = room.queue[room.currentIndex];
    const at = computeRoomTime(room, now);
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        queue: cur ? [cur] : [],
        currentIndex: 0,
        anchorTime: at,
        anchorAt: now,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  return { room, changed: false };
}

