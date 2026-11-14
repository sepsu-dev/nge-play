"use client";

import { useMemo } from "react";
import { usePlayer } from "@/app/(app)/player-provider";
import type { Track } from "@/actions/ytm-core";
import { AlbumsGrid, ArtistsGrid } from "@/components/library/browse-grids";
import { HomeDashboard } from "@/components/library/home-dashboard";
import { LibraryView } from "@/components/library/library-view";
import { TrackListView } from "@/components/library/track-list-view";
import { normalizePlaylistId, ROUTES } from "@/lib/routes";

/**
 * Konten utama per menu. Dirender oleh tiap route (page.tsx) menggunakan
 * store player dari layout, sehingga navigasi tidak menyentuh player.
 */
export function MainContent() {
  const s = usePlayer();

  const activeCustomPlaylist = useMemo(
    () => s.customPlaylists.find((p) => p.id === s.activeCustomPlId),
    [s.customPlaylists, s.activeCustomPlId]
  );

  const displayedTracks = useMemo((): Track[] => {
    switch (s.tab) {
      case "artists":
        return s.channelInfo ? s.channelTracks : s.results;
      case "albums":
        return s.activeAlbum ? s.activeAlbum.tracks : s.results;
      case "songs":
        return s.results;
      case "queue":
        return s.queue;
      case "liked":
        return s.liked;
      case "history":
        return s.history;
      case "playlist":
        return activeCustomPlaylist?.tracks || [];
      default:
        return s.results;
    }
  }, [
    s.tab,
    s.channelInfo,
    s.channelTracks,
    s.activeAlbum,
    s.results,
    s.queue,
    s.liked,
    s.history,
    activeCustomPlaylist,
  ]);

  const recentTracks = useMemo((): Track[] => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    for (const t of [...s.history, ...s.results, ...s.trending]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
      if (merged.length >= 12) break;
    }
    return merged;
  }, [s.history, s.results, s.trending]);

  const listLoading =
    s.tab === "playlist"
      ? // Jangan tampilkan halaman kosong: selama boot atau saat id playlist tidak
        // ditemukan (RouteSync akan redirect ke /library), tetap tampilkan skeleton.
        s.hydrating || !activeCustomPlaylist
      : s.tab === "liked" || s.tab === "history"
      ? s.hydrating
      : s.tab === "queue"
      ? s.hydrating || (s.searching && s.queue.length === 0)
      : s.searching;

  const viewKey = `${s.tab}-${s.activeAlbum?.album.id || ""}-${s.channelInfo?.id || ""}-${
    s.tab === "playlist" ? s.activeCustomPlId : ""
  }`;

  return (
    <div key={viewKey} className="np-view-enter flex-1 flex flex-col">
      {s.tab === "home" ? (
        <HomeDashboard
          loading={s.searching}
          albums={s.albums}
          trending={s.trending}
          recentTracks={recentTracks}
          artists={s.artists}
          currentTrack={s.currentTrack}
          isPlaying={s.isPlaying}
          onPlayTrack={s.playTrackNow}
          onTogglePlay={s.togglePlay}
          onOpenAlbum={s.openAlbum}
          onOpenArtist={s.openChannel}
          onOpenMenu={s.openTrackMenu}
          onSeeAllSongs={() => s.navigate({ tab: "songs", path: ROUTES.songs })}
          onSeeAllAlbums={() => {
            s.setActiveAlbum(null);
            s.navigate({ tab: "albums", path: ROUTES.albums });
          }}
          onSeeAllArtists={() => {
            s.setChannelInfo(null);
            s.navigate({ tab: "artists", path: ROUTES.artists });
          }}
        />
      ) : s.tab === "albums" && !s.activeAlbum && s.openingTarget !== "album" ? (
        <AlbumsGrid loading={s.searching} albums={s.albums} onOpenAlbum={s.openAlbum} />
      ) : s.tab === "artists" && !s.channelInfo && s.openingTarget !== "artist" ? (
        <ArtistsGrid loading={s.searching} artists={s.artists} onOpenArtist={s.openChannel} />
      ) : s.tab === "library" ? (
        <LibraryView
          hydrating={s.hydrating}
          likedCount={s.liked.length}
          historyCount={s.history.length}
          customPlaylists={s.customPlaylists}
          onOpenLiked={() => s.navigate({ tab: "liked", path: ROUTES.liked })}
          onOpenHistory={() => s.navigate({ tab: "history", path: ROUTES.history })}
          onOpenPlaylist={(id) => {
            const playlistId = normalizePlaylistId(id);
            s.setActiveCustomPlId(playlistId);
            s.navigate({ tab: "playlist", path: ROUTES.playlist(playlistId), entityId: playlistId });
          }}
          onOpenNewPlaylist={() => s.openCreatePlaylist()}
        />
      ) : (
        <TrackListView
          tab={s.tab}
          searching={listLoading}
          displayedTracks={displayedTracks}
          albums={s.albums}
          artists={s.artists}
          currentTrack={s.currentTrack}
          isPlaying={s.isPlaying}
          liked={s.liked}
          playlists={s.playlists}
          activePlaylistId={s.activePlaylistId}
          heroTitle={s.heroTitle}
          activeAlbum={s.activeAlbum}
          channelInfo={s.channelInfo}
          channelCont={s.channelCont}
          loadingMore={s.loadingMore}
          activeCustomPlaylist={activeCustomPlaylist}
          queueLength={s.queue.length}
          onBack={() => {
            s.setOpeningTarget(null);
            if (s.tab === "liked" || s.tab === "history" || s.tab === "playlist") {
              s.navigate({ tab: "library", path: ROUTES.library });
              return;
            }
            s.setActiveAlbum(null);
            s.setChannelInfo(null);
            s.navigate({ tab: "albums", path: ROUTES.albums });
          }}
          onPlayAll={s.playAll}
          onPlayTrack={s.playTrackNow}
          onTogglePlay={s.togglePlay}
          onOpenAlbum={s.openAlbum}
          onOpenArtist={s.openChannel}
          onSeeAllAlbums={() => {
            s.setActiveAlbum(null);
            s.navigate({ tab: "albums", path: ROUTES.albums });
          }}
          onSeeAllArtists={() => {
            s.setChannelInfo(null);
            s.navigate({ tab: "artists", path: ROUTES.artists });
          }}
          onToggleLike={s.toggleLike}
          onOpenMenu={(track, e, customPlaylistId) => s.openTrackMenu(track, e, customPlaylistId)}
          onSelectPlaylist={s.handleSelectPlaylist}
          onDeleteCustomPlaylist={s.deleteCustomPlaylist}
          onRenameCustomPlaylist={s.openRenamePlaylist}
          onClearQueue={s.clearQueue}
          onClearHistory={s.clearHistory}
          onLoadMoreChannel={s.loadMoreChannel}
        />
      )}
    </div>
  );
}