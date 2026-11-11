"use client";

import { useSyncExternalStore } from "react";

export interface ClockSnapshot {
  currentTime: number;
  duration: number;
}

export interface ClockStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ClockSnapshot;
  set: (currentTime: number, duration?: number) => void;
}

export function createClockStore(): ClockStore {
  let snap: ClockSnapshot = { currentTime: 0, duration: 0 };
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snap;
    },
    set(currentTime, duration) {
      const nextDur = duration !== undefined ? duration : snap.duration;
      if (snap.currentTime === currentTime && snap.duration === nextDur) return;
      snap = { currentTime, duration: nextDur };
      listeners.forEach((l) => l());
    },
  };
}

export function usePlaybackClock(clock: ClockStore): ClockSnapshot {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}
