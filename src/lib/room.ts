import type { Track } from "@/actions/youtube";

export const MEMBER_ICON_IDS = [
  "fox",
  "panda",
  "cat",
  "owl",
  "bear",
  "koala",
  "frog",
  "bunny",
  "duck",
  "headphones",
] as const;

export type MemberIconId = (typeof MEMBER_ICON_IDS)[number];

export interface RoomMember {
  id: string;
  name: string;
  icon: MemberIconId;
}

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
  members: RoomMember[];
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

const NAME_ADJ = [
  "Chill",
  "Groovy",
  "Lo-Fi",
  "Sunny",
  "Mellow",
  "Cosmic",
  "Breezy",
  "Jazzy",
  "Velvet",
  "Dreamy",
  "Acoustic",
  "Smooth",
];

const NAME_NOUN = [
  "Fox",
  "Cat",
  "Panda",
  "Owl",
  "Bear",
  "Koala",
  "Otter",
  "Lynx",
  "Wolf",
  "Robin",
  "Seal",
  "Duck",
];

export function sanitizeMemberName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function generateMemberName(): string {
  const adj = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const noun = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${adj} ${noun}`;
}

export function parseMemberIcon(raw: unknown): MemberIconId | null {
  return typeof raw === "string" && (MEMBER_ICON_IDS as readonly string[]).includes(raw)
    ? (raw as MemberIconId)
    : null;
}

export function generateMemberIcon(): MemberIconId {
  return MEMBER_ICON_IDS[Math.floor(Math.random() * MEMBER_ICON_IDS.length)];
}

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
  clientName?: string;
  clientIcon?: MemberIconId;
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
  const name = sanitizeMemberName(params.clientName || "") || generateMemberName();
  const icon = parseMemberIcon(params.clientIcon) || generateMemberIcon();

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
    members: [{ id: params.clientId, name, icon }],
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

