"use client";

import type { Track } from "@/actions/youtube";
import { HomeDashboard } from "@/components/library/home-dashboard";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AlbumsGrid, ArtistsGrid } from "@/components/library/browse-grids";
import { LibraryView } from "@/components/library/library-view";
import { NewPlaylistModal } from "@/components/library/new-playlist-modal";
import { TrackContextMenu } from "@/components/library/track-context-menu";
import { TrackListView } from "@/components/library/track-list-view";
import { NowPlayingModal } from "@/components/player/now-playing-modal";
import { PlayerFooter } from "@/components/player/player-footer";
import { RoomModal } from "@/components/room/room-modal";
import { useNgePlay } from "@/hooks/use-nge-play";
import type { TabId } from "@/lib/player-state";

export default function NgePlayPage() {
  const s = useNgePlay();

  const activeCustomPlaylist = s.customPlaylists.find((p) => p.id === s.activeCustomPlId);
  const isCurrentLiked = s.liked.some((t) => t.id === s.currentTrack?.id);

  const displayedTracks =
    s.tab === "artists" && s.channelInfo
      ? s.channelTracks
      : s.tab === "albums" && s.activeAlbum
      ? s.activeAlbum.tracks
      : s.tab === "songs"
      ? s.results
      : s.tab === "queue"
      ? s.queue
      : s.tab === "liked"
      ? s.liked
      : s.tab === "history"
      ? s.history
      : s.tab === "playlist"
      ? activeCustomPlaylist?.tracks || []
      : s.results;

  const recentTracks = (() => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    for (const t of [...s.history, ...s.results]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
      if (merged.length >= 12) break;
    }
    return merged;
  })();

  function handleSelectTab(nextTab: TabId) {
    s.setTab(nextTab);
    s.setOpeningTarget(null);
    if (nextTab === "albums") s.setActiveAlbum(null);
    if (nextTab === "artists") s.setChannelInfo(null);
  }

  const listLoading =
    s.tab === "liked" || s.tab === "history" || s.tab === "playlist"
      ? s.hydrating
      : s.tab === "queue"
      ? s.hydrating || (s.searching && s.queue.length === 0)
      : s.searching;

  const viewKey = `${s.tab}-${s.activeAlbum?.album.id || ""}-${s.channelInfo?.id || ""}-${
    s.tab === "playlist" ? s.activeCustomPlId : ""
  }`;

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7] flex flex-col select-none">
      <AppHeader
        query={s.query}
        room={s.room}
        onQueryChange={s.setQuery}
        onSearch={s.handleSearch}
        onClearSearch={() => {
          s.setQuery("");
          if (!s.activePlaylistId && s.playlists[0]) s.handleSelectPlaylist(s.playlists[0]);
        }}
        onLogoClick={() => {
          s.setTab("home");
          s.setActiveAlbum(null);
          s.setChannelInfo(null);
        }}
        onOpenRoom={() => s.setRoomModalOpen(true)}
      />

      <div className="flex-1 flex min-w-0">
        <AppSidebar
          tab={s.tab}
          hydrating={s.hydrating}
          likedCount={s.liked.length}
          customPlaylists={s.customPlaylists}
          activeCustomPlId={s.activeCustomPlId}
          onSelectTab={handleSelectTab}
          onSelectCustomPlaylist={(id) => {
            s.setActiveCustomPlId(id);
            s.setTab("playlist");
          }}
          onOpenNewPlaylist={() => s.setNewPlaylistOpen(true)}
        />

        <main className="flex-1 min-w-0 px-5 sm:px-8 pt-6 pb-36 lg:pb-24 flex flex-col">
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
                onSeeAllSongs={() => s.setTab("songs")}
                onSeeAllAlbums={() => {
                  s.setActiveAlbum(null);
                  s.setTab("albums");
                }}
                onSeeAllArtists={() => {
                  s.setChannelInfo(null);
                  s.setTab("artists");
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
                onOpenLiked={() => s.setTab("liked")}
                onOpenHistory={() => s.setTab("history")}
                onOpenPlaylist={(id) => {
                  s.setActiveCustomPlId(id);
                  s.setTab("playlist");
                }}
                onOpenNewPlaylist={() => s.setNewPlaylistOpen(true)}
              />
            ) : (
              <TrackListView
                tab={s.tab}
                searching={listLoading}
                displayedTracks={displayedTracks}
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
                    s.setTab("library");
                    return;
                  }
                  s.setActiveAlbum(null);
                  s.setChannelInfo(null);
                }}
                onPlayAll={s.playAll}
                onPlayTrack={s.playTrackNow}
                onTogglePlay={s.togglePlay}
                onOpenArtist={s.openChannel}
                onToggleLike={s.toggleLike}
                onOpenMenu={s.openTrackMenu}
                onSelectPlaylist={s.handleSelectPlaylist}
                onDeleteCustomPlaylist={s.deleteCustomPlaylist}
                onClearQueue={s.clearQueue}
                onClearHistory={s.clearHistory}
                onLoadMoreChannel={s.loadMoreChannel}
              />
            )}
          </div>
        </main>
      </div>

      <PlayerFooter
        tab={s.tab}
        loading={s.hydrating || s.searching}
        nowPlayingOpen={s.nowPlayingOpen}
        currentTrack={s.currentTrack}
        isPlaying={s.isPlaying}
        isCurrentLiked={isCurrentLiked}
        repeat={s.repeat}
        shuffle={s.shuffle}
        volume={s.volume}
        muted={s.muted}
        mobileVolOpen={s.mobileVolOpen}
        clock={s.clock}
        onSelectTab={handleSelectTab}
        onToggleNowPlaying={() => s.setNowPlayingOpen((o) => !o)}
        onOpenArtist={s.openChannel}
        onToggleRepeat={() => s.setRepeat((r) => !r)}
        onPrev={s.handlePrev}
        onTogglePlay={s.togglePlay}
        onNext={s.handleNext}
        onToggleShuffle={() => s.setShuffle((sh) => !sh)}
        onSeek={s.handleSeek}
        onVolumeChange={s.handleVolume}
        onToggleMute={s.toggleMute}
        onToggleMobileVol={() => s.setMobileVolOpen((v) => !v)}
        onToggleLike={s.toggleLike}
      />

      <TrackContextMenu
        menu={s.trackMenu}
        liked={s.liked}
        customPlaylists={s.customPlaylists}
        onClose={() => s.setTrackMenu(null)}
        onPlayNow={(track) => s.playTrackNow(track)}
        onToggleLike={(track) => s.toggleLike(track)}
        onOpenArtist={s.openChannel}
        onRemoveFromPlaylist={s.removeTrackFromPlaylist}
        onAddToPlaylist={s.addTrackToPlaylist}
        onNewPlaylist={() => s.setNewPlaylistOpen(true)}
      />

      <NewPlaylistModal
        open={s.newPlaylistOpen}
        name={s.newPlaylistName}
        onNameChange={s.setNewPlaylistName}
        onClose={() => s.setNewPlaylistOpen(false)}
        onCreate={s.createCustomPlaylist}
      />

      <RoomModal
        open={s.roomModalOpen}
        room={s.room}
        busy={s.roomBusy}
        memberId={s.memberId}
        memberName={s.memberName}
        memberIcon={s.memberIcon}
        onClose={() => s.setRoomModalOpen(false)}
        onCreateRoom={s.createRoom}
        onJoinRoom={s.joinRoom}
        onLeaveRoom={s.leaveRoom}
        onUpdateName={s.updateMemberName}
        onUpdateIcon={s.updateMemberIcon}
      />

      <NowPlayingModal
        open={s.nowPlayingOpen}
        currentTrack={s.currentTrack}
        isPlaying={s.isPlaying}
        isCurrentLiked={isCurrentLiked}
        nowPlayingTab={s.nowPlayingTab}
        queue={s.queue}
        loadingQueue={s.hydrating || (s.searching && !s.queue.length)}
        currentIndex={s.currentIndex}
        lyrics={s.lyrics}
        loadingLyrics={s.loadingLyrics}
        lyricVariantIdx={s.lyricVariantIdx}
        lyricOffset={s.lyricOffset}
        relatedTracks={s.relatedTracks}
        loadingRelated={s.loadingRelated}
        clock={s.clock}
        onClose={() => s.setNowPlayingOpen(false)}
        onTabChange={s.setNowPlayingTab}
        onCycleLyricVariant={s.cycleLyricVariant}
        onChangeLyricOffset={s.changeLyricOffset}
        onOpenArtist={s.openChannel}
        onToggleLike={s.toggleLike}
        onOpenMenu={(track, e) => s.openTrackMenu(track, e)}
        onSaveToPlaylist={(track, e) => s.openTrackMenu(track, e, undefined, true)}
        onPlayTrackAt={s.playTrackAt}
        onPlayTrackNow={s.playTrackNow}
        onSeek={s.handleSeek}
      />
    </div>
  );
}

