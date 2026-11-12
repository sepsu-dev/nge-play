"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { Track } from "@/actions/youtube";
import type { ClockStore } from "@/lib/playback-clock";
import {
  MEMBER_ICON_IDS,
  computeRoomTime,
  generateMemberIcon,
  generateMemberName,
  parseMemberIcon,
  sanitizeMemberName,
  sanitizeRoomCode,
  type MemberIconId,
  type RoomCommand,
  type RoomState,
} from "@/lib/room";

export function isSameQueue(a: Track[], b: Track[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i]?.id);
}

function setRoomUrlParam(code: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export interface RoomPlayerBridge {
  loadVideo: (videoId: string, seekTo?: number, autoPlay?: boolean) => void;
  seekTo: (val: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
}

interface UseRoomSyncOptions {
  clock: ClockStore;
  playerRef: React.RefObject<RoomPlayerBridge | null>;
  queueRef: React.MutableRefObject<Track[]>;
  currentIndexRef: React.MutableRefObject<number>;
  activeTrackIdRef: React.MutableRefObject<string>;
  hasUserPlaybackRef: React.MutableRefObject<boolean>;
  isPlayingRef: React.MutableRefObject<boolean>;
  getFallbackQueue: () => Track[];
  getLyricPrefs: () => { variantIdx: number; offset: number };
  onQueueSync: (queue: Track[]) => void;
  onIndexSync: (index: number) => void;
  onPlayingSync: (playing: boolean) => void;
  onLyricPrefsSync: (variantIdx: number, offset: number) => void;
  onRecordHistory: (track: Track) => void;
}

export function useRoomSync({
  clock,
  playerRef,
  queueRef,
  currentIndexRef,
  activeTrackIdRef,
  hasUserPlaybackRef,
  isPlayingRef,
  getFallbackQueue,
  getLyricPrefs,
  onQueueSync,
  onIndexSync,
  onPlayingSync,
  onLyricPrefsSync,
  onRecordHistory,
}: UseRoomSyncOptions) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberIcon, setMemberIcon] = useState<MemberIconId>(MEMBER_ICON_IDS[0]);

  const roomRef = useRef<RoomState | null>(null);
  const clientIdRef = useRef("");
  const memberNameRef = useRef("");
  const memberIconRef = useRef<MemberIconId | "">("");
  const clockOffsetRef = useRef(0);
  const hasClockOffsetRef = useRef(false);
  const bestRttRef = useRef(Infinity);
  const lastRoomResyncAtRef = useRef(0);
  const lastAppliedVersionRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const getClientId = useCallback(() => {
    if (!clientIdRef.current) {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      clientIdRef.current = id;
      setMemberId(id);
    }
    return clientIdRef.current;
  }, []);

  const getMemberName = useCallback(() => {
    if (memberNameRef.current) return memberNameRef.current;
    let name = "";
    try {
      name = sanitizeMemberName(localStorage.getItem("ngeplay_member_name") || "");
    } catch {}
    if (!name) {
      name = generateMemberName();
      try {
        localStorage.setItem("ngeplay_member_name", name);
      } catch {}
    }
    memberNameRef.current = name;
    setMemberName(name);
    return name;
  }, []);

  const getMemberIcon = useCallback((): MemberIconId => {
    if (memberIconRef.current) return memberIconRef.current;
    let icon: MemberIconId | null = null;
    try {
      icon = parseMemberIcon(localStorage.getItem("ngeplay_member_icon"));
    } catch {}
    if (!icon) {
      icon = generateMemberIcon();
      try {
        localStorage.setItem("ngeplay_member_icon", icon);
      } catch {}
    }
    memberIconRef.current = icon;
    setMemberIcon(icon);
    return icon;
  }, []);

  const initIdentity = useCallback(() => {
    getClientId();
    getMemberName();
    getMemberIcon();
  }, [getClientId, getMemberIcon, getMemberName]);

  const syncClockOffset = useCallback((serverNow: number, t0?: number) => {
    const t1 = Date.now();
    if (t0 !== undefined) {
      const rtt = Math.max(0, t1 - t0);
      if (!hasClockOffsetRef.current || rtt <= bestRttRef.current + 120) {
        hasClockOffsetRef.current = true;
        bestRttRef.current = Math.min(bestRttRef.current, rtt);
        clockOffsetRef.current = serverNow - (t0 + t1) / 2;
      }
      return;
    }
    if (!hasClockOffsetRef.current) {
      clockOffsetRef.current = serverNow - t1;
    }
  }, []);

  const clearRoomLocal = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    roomRef.current = null;
    lastAppliedVersionRef.current = 0;
    hasClockOffsetRef.current = false;
    bestRttRef.current = Infinity;
    clockOffsetRef.current = 0;
    lastRoomResyncAtRef.current = 0;
    setRoom(null);
    setRoomUrlParam(null);
  }, []);

  const applyRoomSnapshot = useCallback(
    (nextRoom: RoomState, serverNow: number) => {
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      if (nextRoom.version <= lastAppliedVersionRef.current) return;
      lastAppliedVersionRef.current = nextRoom.version;
      hasUserPlaybackRef.current = true;

      onLyricPrefsSync(nextRoom.lyricVariantIdx ?? 0, nextRoom.lyricOffset ?? 0);

      const estServerNow = hasClockOffsetRef.current
        ? Date.now() + clockOffsetRef.current
        : serverNow;
      const targetTime = computeRoomTime(nextRoom, estServerNow);
      if (!isSameQueue(queueRef.current, nextRoom.queue)) {
        queueRef.current = nextRoom.queue;
        onQueueSync(nextRoom.queue);
      }

      const prevTrackId = activeTrackIdRef.current;
      const nextTrack = nextRoom.queue[nextRoom.currentIndex];
      currentIndexRef.current = nextRoom.currentIndex;
      onIndexSync(nextRoom.currentIndex);

      if (!nextTrack) {
        activeTrackIdRef.current = "";
        onPlayingSync(false);
        clock.set(0, 0);
        return;
      }

      activeTrackIdRef.current = nextTrack.id;
      if (nextTrack.id !== prevTrackId) {
        clock.set(targetTime, 0);
        onPlayingSync(nextRoom.isPlaying);
        onRecordHistory(nextTrack);
        playerRef.current?.loadVideo(nextTrack.id, targetTime, nextRoom.isPlaying);
        return;
      }

      const localTime = clock.getSnapshot().currentTime;
      const wasPlaying = isPlayingRef.current;
      if (nextRoom.isPlaying !== wasPlaying) {
        onPlayingSync(nextRoom.isPlaying);
        if (nextRoom.isPlaying) {
          if (Math.abs(localTime - targetTime) > 0.5) {
            const target = targetTime + 0.1;
            lastRoomResyncAtRef.current = Date.now();
            playerRef.current?.seekTo(target);
            clock.set(target);
          }
          playerRef.current?.playVideo();
        } else {
          playerRef.current?.pauseVideo();
          clock.set(targetTime);
          if (Math.abs(localTime - targetTime) > 0.25) playerRef.current?.seekTo(targetTime);
        }
      } else if (Math.abs(localTime - targetTime) > (nextRoom.isPlaying ? 0.5 : 0.25)) {
        const target = nextRoom.isPlaying ? targetTime + 0.1 : targetTime;
        lastRoomResyncAtRef.current = Date.now();
        playerRef.current?.seekTo(target);
        clock.set(target);
      }
    },
    [
      activeTrackIdRef,
      clock,
      currentIndexRef,
      hasUserPlaybackRef,
      isPlayingRef,
      onIndexSync,
      onLyricPrefsSync,
      onPlayingSync,
      onQueueSync,
      onRecordHistory,
      playerRef,
      queueRef,
    ]
  );

  const connectRoomStream = useCallback(
    (code: string) => {
      eventSourceRef.current?.close();
      const es = new EventSource(
        `/api/room?code=${encodeURIComponent(code)}&clientId=${encodeURIComponent(
          getClientId()
        )}&name=${encodeURIComponent(getMemberName())}&icon=${encodeURIComponent(
          getMemberIcon()
        )}`
      );
      eventSourceRef.current = es;
      es.addEventListener("state", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            room: RoomState;
            serverNow: number;
          };
          syncClockOffset(data.serverNow);
          applyRoomSnapshot(data.room, data.serverNow);
        } catch {}
      });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED && roomRef.current?.code === code) {
          clearRoomLocal();
          toast.error("Room ended");
        }
      };
    },
    [applyRoomSnapshot, clearRoomLocal, getClientId, getMemberIcon, getMemberName, syncClockOffset]
  );

  const sendRoomCommand = useCallback(
    async (command: RoomCommand) => {
      const cur = roomRef.current;
      if (!cur) return;
      const t0 = Date.now();
      try {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "command",
            code: cur.code,
            clientId: getClientId(),
            command,
          }),
        });
        if (res.status === 404) {
          clearRoomLocal();
          toast.error("Room not found");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { room: RoomState; serverNow: number };
        syncClockOffset(data.serverNow, t0);
        applyRoomSnapshot(data.room, data.serverNow);
      } catch {}
    },
    [applyRoomSnapshot, clearRoomLocal, getClientId, syncClockOffset]
  );


  const createRoom = useCallback(async () => {
    setRoomBusy(true);
    const t0 = Date.now();
    try {
      const q = queueRef.current.length ? queueRef.current : getFallbackQueue();
      const { variantIdx, offset } = getLyricPrefs();
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "create",
          clientId: getClientId(),
          name: getMemberName(),
          icon: getMemberIcon(),
          queue: q,
          currentIndex: queueRef.current.length ? currentIndexRef.current : 0,
          currentTime: queueRef.current.length ? clock.getSnapshot().currentTime : 0,
          isPlaying: queueRef.current.length ? isPlayingRef.current : false,
          lyricVariantIdx: variantIdx,
          lyricOffset: offset,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { room: RoomState; serverNow: number };
      syncClockOffset(data.serverNow, t0);
      roomRef.current = data.room;
      lastAppliedVersionRef.current = data.room.version;
      setRoom(data.room);
      setRoomUrlParam(data.room.code);
      connectRoomStream(data.room.code);
      toast.success(`Room ${data.room.code} created`);
    } catch {
      toast.error("Failed to create room");
    } finally {
      setRoomBusy(false);
    }
  }, [
    clock,
    connectRoomStream,
    currentIndexRef,
    getClientId,
    getFallbackQueue,
    getLyricPrefs,
    getMemberIcon,
    getMemberName,
    isPlayingRef,
    queueRef,
    syncClockOffset,
  ]);

  const joinRoom = useCallback(
    async (rawCode: string, silent = false): Promise<boolean> => {
      const code = sanitizeRoomCode(rawCode);
      if (!code) return false;
      setRoomBusy(true);
      const t0 = Date.now();
      try {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "join",
            code,
            clientId: getClientId(),
            name: getMemberName(),
            icon: getMemberIcon(),
          }),
        });
        if (!res.ok) {
          if (silent) setRoomUrlParam(null);
          toast.error("Room not found");
          return false;
        }
        const data = (await res.json()) as { room: RoomState; serverNow: number };
        syncClockOffset(data.serverNow, t0);
        lastAppliedVersionRef.current = 0;
        applyRoomSnapshot(data.room, data.serverNow);
        setRoomUrlParam(data.room.code);
        connectRoomStream(data.room.code);
        toast.success(`Joined room ${data.room.code}`);
        return true;
      } catch {
        toast.error("Failed to join room");
        return false;
      } finally {
        setRoomBusy(false);
      }
    },
    [applyRoomSnapshot, connectRoomStream, getClientId, getMemberIcon, getMemberName, syncClockOffset]
  );

  const updateMemberProfile = useCallback(
    async (patch: { name?: string; icon?: MemberIconId }): Promise<boolean> => {
      const nextName = patch.name !== undefined ? sanitizeMemberName(patch.name) : undefined;
      if (patch.name !== undefined && !nextName) {
        toast.error("Name cannot be empty");
        return false;
      }
      const nextIcon = patch.icon !== undefined ? parseMemberIcon(patch.icon) : undefined;
      if (patch.icon !== undefined && !nextIcon) return false;

      if (nextName) {
        memberNameRef.current = nextName;
        setMemberName(nextName);
        try {
          localStorage.setItem("ngeplay_member_name", nextName);
        } catch {}
      }
      if (nextIcon) {
        memberIconRef.current = nextIcon;
        setMemberIcon(nextIcon);
        try {
          localStorage.setItem("ngeplay_member_icon", nextIcon);
        } catch {}
      }

      const cur = roomRef.current;
      if (!cur) {
        toast.success(nextName ? "Name updated" : "Avatar updated");
        return true;
      }
      const t0 = Date.now();
      try {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "rename",
            code: cur.code,
            clientId: getClientId(),
            ...(nextName ? { name: nextName } : {}),
            ...(nextIcon ? { icon: nextIcon } : {}),
          }),
        });
        if (res.status === 404) {
          clearRoomLocal();
          toast.error("Room not found");
          return false;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { room: RoomState; serverNow: number };
        syncClockOffset(data.serverNow, t0);
        applyRoomSnapshot(data.room, data.serverNow);
        toast.success(nextName ? "Name updated" : "Avatar updated");
        return true;
      } catch {
        toast.error("Failed to update profile");
        return false;
      }
    },
    [applyRoomSnapshot, clearRoomLocal, getClientId, syncClockOffset]
  );


  const updateMemberName = useCallback(
    (rawName: string) => updateMemberProfile({ name: rawName }),
    [updateMemberProfile]
  );

  const updateMemberIcon = useCallback(
    (icon: MemberIconId) => updateMemberProfile({ icon }),
    [updateMemberProfile]
  );

  const leaveRoom = useCallback(() => {
    const code = roomRef.current?.code;
    clearRoomLocal();
    if (code) {
      void fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "leave", code, clientId: getClientId() }),
      }).catch(() => {});
    }
    toast.success("Left room");
  }, [clearRoomLocal, getClientId]);

  const handleRoomPlayerPlaying = useCallback(
    (actualTime: number) => {
      const cur = roomRef.current;
      if (!cur) return;
      if (!cur.isPlaying) {
        playerRef.current?.seekTo(cur.anchorTime);
        playerRef.current?.pauseVideo();
        return;
      }
      const estNow = hasClockOffsetRef.current ? Date.now() + clockOffsetRef.current : Date.now();
      const expected = computeRoomTime(cur, estNow);
      if (Math.abs(actualTime - expected) > 0.35 && Date.now() - lastRoomResyncAtRef.current > 1500) {
        lastRoomResyncAtRef.current = Date.now();
        const target = expected + 0.12;
        playerRef.current?.seekTo(target);
        clock.set(target);
      }
    },
    [clock, playerRef]
  );

  useEffect(() => {
    if (!room?.code || !room.isPlaying) return;
    const timer = setInterval(() => {
      const cur = roomRef.current;
      if (!cur || !cur.isPlaying) return;
      if (playerRef.current?.getPlayerState() !== 1) return;
      const expected = computeRoomTime(cur, Date.now() + clockOffsetRef.current);
      const actual = clock.getSnapshot().currentTime;
      if (Math.abs(actual - expected) > 0.5 && Date.now() - lastRoomResyncAtRef.current > 2000) {
        lastRoomResyncAtRef.current = Date.now();
        const target = expected + 0.1;
        playerRef.current?.seekTo(target);
        clock.set(target);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [room?.code, room?.isPlaying, clock, playerRef]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return {
    room,
    roomRef,
    roomModalOpen,
    setRoomModalOpen,
    roomBusy,
    memberId,
    memberName,
    memberIcon,
    initIdentity,
    createRoom,
    joinRoom,
    leaveRoom,
    updateMemberName,
    updateMemberIcon,
    sendRoomCommand,
    handleRoomPlayerPlaying,
  };
}

