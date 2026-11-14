import { isPlaylistId, type TabId } from "@/lib/player-state";

/**
 * Rute menu aplikasi. Setiap menu punya URL sendiri (seperti YouTube Music),
 * jadi bisa di-refresh, di-bookmark, dan di-share.
 */
export interface Route {
  tab: TabId;
  path: string;
  /** id entitas untuk route detail (album / artist / playlist) */
  entityId?: string;
  /** query pencarian aktif */
  query?: string;
}

export const ROUTES = {
  home: "/",
  search: "/search",
  songs: "/songs",
  albums: "/albums",
  album: (id: string) => `/albums/${encodeURIComponent(id)}`,
  artists: "/artists",
  artist: (id: string) => `/artists/${encodeURIComponent(id)}`,
  library: "/library",
  liked: "/library/liked",
  history: "/library/history",
  // Id playlist = UUID, jadi aman dipakai langsung di path. Tetap di-encode
  // supaya id lama (non-UUID) atau input manual tidak bisa memecah/menyuntik path.
  playlist: (id: string) => `/library/playlist/${encodeURIComponent(id)}`,
  queue: "/queue",
} as const;

/** Samakan id playlist dari URL/state. UUID selalu huruf kecil; id lama dibiarkan
 *  apa adanya agar tetap cocok dengan data tersimpan (lookup case-insensitive). */
export function normalizePlaylistId(id: string): string {
  const trimmed = id.trim();
  return isPlaylistId(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/** Petakan TabId -> rute. Dipakai handler lama agar tetap kompatibel. */
export function tabToRoute(tab: TabId, entityId?: string, query?: string): Route {
  switch (tab) {
    case "home":
      return { tab, path: ROUTES.home };
    case "songs":
      return { tab, path: ROUTES.songs };
    case "albums":
      return { tab, path: entityId ? ROUTES.album(entityId) : ROUTES.albums, entityId };
    case "artists":
      return { tab, path: entityId ? ROUTES.artist(entityId) : ROUTES.artists, entityId };
    case "library":
      return { tab, path: ROUTES.library };
    case "liked":
      return { tab, path: ROUTES.liked };
    case "history":
      return { tab, path: ROUTES.history };
    case "playlist":
      return { tab, path: entityId ? ROUTES.playlist(entityId) : ROUTES.library, entityId };
    case "queue":
      return { tab, path: ROUTES.queue };
    default:
      return { tab: "home", path: ROUTES.home };
  }
}

/** Tebak rute aktif dari URL saat pertama kali dimuat (restore sesi). */
export function routeFromLocation(pathname: string, search: string): Route {
  let path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { tab: "home", path: ROUTES.home };
  if (path === "/search") {
    const q = new URLSearchParams(search).get("q") || "";
    return { tab: "songs", path: ROUTES.search, query: q };
  }
  if (path === "/songs") return { tab: "songs", path: ROUTES.songs };
  if (path === "/queue") return { tab: "queue", path: ROUTES.queue };
  if (path === "/library") return { tab: "library", path: ROUTES.library };
  if (path === "/library/liked") return { tab: "liked", path: ROUTES.liked };
  if (path === "/library/history") return { tab: "history", path: ROUTES.history };
  if (path.startsWith("/library/playlist/")) {
    const id = normalizePlaylistId(decodeURIComponent(path.slice("/library/playlist/".length)));
    if (id) return { tab: "playlist", path: ROUTES.playlist(id), entityId: id };
  }
  // URL lama (/library/<id>) tetap dibaca supaya bookmark lama tidak rusak.
  if (path.startsWith("/library/")) {
    const id = normalizePlaylistId(decodeURIComponent(path.slice("/library/".length)));
    if (id) return { tab: "playlist", path: ROUTES.playlist(id), entityId: id };
  }
  if (path === "/albums") return { tab: "albums", path: ROUTES.albums };
  if (path.startsWith("/albums/")) {
    const id = decodeURIComponent(path.slice("/albums/".length));
    return { tab: "albums", path: ROUTES.album(id), entityId: id };
  }
  if (path === "/artists") return { tab: "artists", path: ROUTES.artists };
  if (path.startsWith("/artists/")) {
    const id = decodeURIComponent(path.slice("/artists/".length));
    return { tab: "artists", path: ROUTES.artist(id), entityId: id };
  }
  return { tab: "home", path: ROUTES.home };
}

/** True bila path cocok dengan menu utama (untuk status aktif di nav). */
export function isTabActive(tab: TabId, pathname: string): boolean {
  return routeFromLocation(pathname, "").tab === tab;
}

/** Library menaungi liked/history/playlist — satu menu di desktop & mobile. */
export function isLibraryPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/library" || path.startsWith("/library/");
}