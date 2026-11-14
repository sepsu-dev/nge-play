"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/app/(app)/player-provider";
import { isPlaylistId, type TabId } from "@/lib/player-state";
import { normalizePlaylistId, ROUTES } from "@/lib/routes";

/**
 * Menyelaraskan menu aktif dengan halaman yang sedang dirender.
 *
 * Navigasi di dalam app memakai router Next, jadi efek ini membaca `s.tab` yang
 * sudah diperbarui oleh navigate() dan hanya bertindak bila keduanya berbeda —
 * mis. saat route dibuka lewat refresh/link.
 *
 * Untuk playlist, URL wajib berakhir dengan UUID. Link lama (id `pl_<timestamp>`
 * atau slug) diarahkan sekali ke UUID hasil migrasi boot lewat router.replace.
 */
export function RouteSync({ tab, entityId }: { tab: TabId; entityId?: string }) {
  const s = usePlayer();
  const router = useRouter();
  // Cegah replace berulang selama router belum selesai memperbarui pathname.
  const redirectedRef = useRef("");

  const normalized = entityId ? normalizePlaylistId(entityId) : undefined;
  const isUuid = !!normalized && isPlaylistId(normalized);
  const alias =
    normalized && !isUuid ? s.playlistAliases[normalized.toLowerCase()] : undefined;
  const targetId = tab === "playlist" ? (isUuid ? normalized : alias) : entityId;

  useEffect(() => {
    if (!entityId) {
      if (s.tab !== tab) s.syncRoute(tab);
      return;
    }

    if (tab !== "playlist") {
      if (s.tab !== tab || s.route.entityId !== entityId) s.syncRoute(tab, entityId);
      return;
    }

    // Tunggu migrasi playlist selesai sebelum memutuskan id lama valid atau tidak.
    if (!targetId && s.hydrating) return;

    const exists = !!targetId && s.customPlaylists.some((p) => p.id === targetId);
    if (!targetId || (!exists && !s.hydrating)) {
      // Id tidak dikenal (mis. link lama yang playlist-nya sudah dihapus).
      if (redirectedRef.current !== normalized) {
        redirectedRef.current = normalized ?? "";
        s.syncRoute("library");
        router.replace(ROUTES.library);
      }
      return;
    }

    if (s.tab !== tab || s.route.entityId !== targetId || s.activeCustomPlId !== targetId) {
      s.syncRoute(tab, targetId);
    }

    // Id lama -> ganti URL ke UUID hasil migrasi, sekali saja.
    if (!isUuid && redirectedRef.current !== normalized) {
      redirectedRef.current = normalized ?? "";
      router.replace(ROUTES.playlist(targetId!));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    entityId,
    normalized,
    isUuid,
    targetId,
    s.tab,
    s.route.entityId,
    s.activeCustomPlId,
    s.hydrating,
    s.customPlaylists,
    s.playlistAliases,
    router,
  ]);

  return null;
}
