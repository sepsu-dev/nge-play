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

// Id playlist lama (sebelum UUID) berformat aman: huruf/angka/underscore/hyphen.
// Selain itu dianggap path rusak -> kembali ke Library.
const LEGACY_PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function isPlaylistRouteId(id: string): boolean {
  return isPlaylistId(id) || LEGACY_PLAYLIST_ID_RE.test(id);
}

/** Decode URL dengan aman: `%` rusak tidak boleh membuat seluruh app crash. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Id album berasal dari YouTube `browseId` (mis. MPREb_...), id artis = channel
// ID YouTube (UC...). Divalidasi ketat supaya path/karakter aneh tidak pernah
// diteruskan ke API atau dipakai membangun URL.
const ALBUM_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ARTIST_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

export function isAlbumId(id: string): boolean {
  return ALBUM_ID_RE.test(id.trim());
}

export function isArtistId(id: string): boolean {
  return ARTIST_ID_RE.test(id.trim());
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
  if (path === "/library/playlist") return { tab: "library", path: ROUTES.library };
  if (path.startsWith("/library/playlist/")) {
    const id = normalizePlaylistId(safeDecode(path.slice("/library/playlist/".length)));
    if (isPlaylistRouteId(id)) return { tab: "playlist", path: ROUTES.playlist(id), entityId: id };
    return { tab: "library", path: ROUTES.library };
  }
  // URL lama (/library/<id>) tetap dibaca supaya bookmark lama tidak rusak.
  if (path.startsWith("/library/")) {
    const id = normalizePlaylistId(safeDecode(path.slice("/library/".length)));
    if (isPlaylistRouteId(id)) return { tab: "playlist", path: ROUTES.playlist(id), entityId: id };
    return { tab: "library", path: ROUTES.library };
  }
  if (path === "/albums") return { tab: "albums", path: ROUTES.albums };
  if (path.startsWith("/albums/")) {
    const id = safeDecode(path.slice("/albums/".length)).trim();
    // Id tidak valid -> tampilkan daftar album, bukan halaman detail kosong.
    if (!isAlbumId(id)) return { tab: "albums", path: ROUTES.albums };
    return { tab: "albums", path: ROUTES.album(id), entityId: id };
  }
  if (path === "/artists") return { tab: "artists", path: ROUTES.artists };
  if (path.startsWith("/artists/")) {
    const id = safeDecode(path.slice("/artists/".length)).trim();
    if (!isArtistId(id)) return { tab: "artists", path: ROUTES.artists };
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