"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useNgePlay } from "@/hooks/use-nge-plays";

type NgePlayStore = ReturnType<typeof useNgePlay>;

const PlayerContext = createContext<NgePlayStore | null>(null);

/**
 * Single instance of the player store for the whole app shell.
 * Lives in the (app) layout so route navigation never re-mounts the YouTube iframe,
 * the audio clock, or the room SSE stream — playback keeps going across menus.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const store = useNgePlay();
  const value = useMemo(() => store, [store]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): NgePlayStore {
  const store = useContext(PlayerContext);
  if (!store) {
    throw new Error("usePlayer must be used inside <PlayerProvider> (app layout)");
  }
  return store;
}