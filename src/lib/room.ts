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

export interface MemberAvatarMeta {
  id: MemberIconId;
  label: string;
  emoji: string;
  bg: string;
}

export const MEMBER_AVATARS: MemberAvatarMeta[] = [
  { id: "fox", label: "Fox", emoji: "🦊", bg: "bg-orange-100 dark:bg-orange-500/20" },
  { id: "panda", label: "Panda", emoji: "🐼", bg: "bg-zinc-200 dark:bg-zinc-500/25" },
  { id: "cat", label: "Cat", emoji: "🐱", bg: "bg-amber-100 dark:bg-amber-500/20" },
  { id: "owl", label: "Owl", emoji: "🦉", bg: "bg-stone-200 dark:bg-stone-500/25" },
  { id: "bear", label: "Bear", emoji: "🐻", bg: "bg-yellow-100 dark:bg-yellow-500/20" },
  { id: "koala", label: "Koala", emoji: "🐨", bg: "bg-sky-100 dark:bg-sky-500/20" },
  { id: "frog", label: "Frog", emoji: "🐸", bg: "bg-emerald-100 dark:bg-emerald-500/20" },
  { id: "bunny", label: "Bunny", emoji: "🐰", bg: "bg-pink-100 dark:bg-pink-500/20" },
  { id: "duck", label: "Duck", emoji: "🦆", bg: "bg-teal-100 dark:bg-teal-500/20" },
  { id: "headphones", label: "Listener", emoji: "🎧", bg: "bg-[#FFF9DB] dark:bg-[#FFD014]/20" },
];

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
  lyricVariantIdx: number;
  lyricOffset: number;
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
  | { type: "clearQueue" }
  | { type: "setLyrics"; variantIdx?: number; offset?: number };

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
  lyricVariantIdx?: number;
  lyricOffset?: number;
  now?: number;
}): RoomState {
  const now = params.now ?? Date.now();
  const queue = params.queue.slice(0, 60);
  const maxIdx = Math.max(0, queue.length - 1);
  const currentIndex = Math.min(Math.max(0, params.currentIndex), maxIdx);
  const anchorTime = Math.max(0, Number.isFinite(params.currentTime) ? params.currentTime : 0);
  const lyricVariantIdx =
    typeof params.lyricVariantIdx === "number" && Number.isFinite(params.lyricVariantIdx)
      ? Math.max(0, Math.floor(params.lyricVariantIdx))
      : 0;
  const lyricOffset =
    typeof params.lyricOffset === "number" && Number.isFinite(params.lyricOffset)
      ? Math.max(-30, Math.min(30, Math.round(params.lyricOffset * 10) / 10))
      : 0;
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
    lyricVariantIdx,
    lyricOffset,
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
    const sameTrack = nextQueue[idx]?.id === room.queue[room.currentIndex]?.id;
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
        lyricVariantIdx: sameTrack ? room.lyricVariantIdx : 0,
        lyricOffset: sameTrack ? room.lyricOffset : 0,
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
    const sameTrack = room.queue[idx]?.id === room.queue[room.currentIndex]?.id;
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        currentIndex: idx,
        isPlaying: true,
        anchorTime: 0,
        anchorAt: now,
        lyricVariantIdx: sameTrack ? room.lyricVariantIdx : 0,
        lyricOffset: sameTrack ? room.lyricOffset : 0,
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
    const sameTrack = room.queue[idx]?.id === room.queue[room.currentIndex]?.id;
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        currentIndex: idx,
        isPlaying: true,
        anchorTime: 0,
        anchorAt: now,
        lyricVariantIdx: sameTrack ? room.lyricVariantIdx : 0,
        lyricOffset: sameTrack ? room.lyricOffset : 0,
        updatedBy: clientId,
        lastActivityAt: now,
      },
    };
  }

  if (command.type === "setLyrics") {
    const nextVariant =
      typeof command.variantIdx === "number" && Number.isFinite(command.variantIdx)
        ? Math.max(0, Math.floor(command.variantIdx))
        : room.lyricVariantIdx;
    const nextOffset =
      typeof command.offset === "number" && Number.isFinite(command.offset)
        ? Math.max(-30, Math.min(30, Math.round(command.offset * 10) / 10))
        : room.lyricOffset;
    if (nextVariant === room.lyricVariantIdx && nextOffset === room.lyricOffset) {
      return { room, changed: false };
    }
    return {
      changed: true,
      room: {
        ...room,
        version: room.version + 1,
        lyricVariantIdx: nextVariant,
        lyricOffset: nextOffset,
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

