"use client";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NewPlaylistModal } from "@/components/library/new-playlist-modal";
import { TrackContextMenu } from "@/components/library/track-context-menu";
import { NowPlayingModal } from "@/components/player/now-playing-modal";
import { PlayerFooter } from "@/components/player/player-footer";
import { RoomModal } from "@/components/room/room-modal";
import { usePlayer } from "@/app/(app)/player-provider";
import { ROUTES } from "@/lib/routes";

/**
 * Shell aplikasi: header, sidebar, footer, overlay, dan host iframe YouTube.
 * Karena berada di layout (bukan di halaman), pindah menu tidak me-remount player.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const s = usePlayer();
  const isCurrentLiked = s.liked.some((t) => t.id === s.currentTrack?.id);

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7] flex flex-col select-none">
      <AppHeader
        query={s.query}
        room={s.room}
        onQueryChange={s.setQuery}
        onSearch={s.handleSearch}
        onClearSearch={() => {
          s.setQuery("");
          s.navigate({ tab: "home", path: ROUTES.home });
        }}
        onLogoClick={() => {
          s.navigate({ tab: "home", path: ROUTES.home });
          s.setActiveAlbum(null);
          s.setChannelInfo(null);
        }}
        onOpenRoom={() => s.setRoomModalOpen(true)}
      />

      <div className="flex-1 flex min-w-0">
        <AppSidebar tab={s.tab} likedCount={s.liked.length} onSelectTab={s.setTab} />

        <main className="flex-1 min-w-0 px-5 sm:px-8 pt-6 pb-36 lg:pb-24 flex flex-col">
          {children}
        </main>
      </div>

      <PlayerFooter
        tab={s.tab}
        currentTrack={s.currentTrack}
        nowPlayingOpen={s.nowPlayingOpen}
        isPlaying={s.isPlaying}
        isCurrentLiked={isCurrentLiked}
        repeat={s.repeat}
        shuffle={s.shuffle}
        volume={s.volume}
        muted={s.muted}
        mobileVolOpen={s.mobileVolOpen}
        clock={s.clock}
        onSelectTab={s.setTab}
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
        onNewPlaylist={() => s.openCreatePlaylist()}
      />

      <NewPlaylistModal
        open={s.newPlaylistOpen}
        mode={s.playlistModalMode}
        name={s.newPlaylistName}
        onNameChange={s.setNewPlaylistName}
        onClose={() => s.setNewPlaylistOpen(false)}
        onConfirm={(name) =>
          s.playlistModalMode === "rename" && s.renamePlaylistId
            ? s.renameCustomPlaylist(s.renamePlaylistId, name)
            : s.createCustomPlaylist(name)
        }
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

      {/* ponytail: offscreen -z-50 opacity-0 + 220x200 keeps YouTube API happy without rendering on screen.
          Lives in the layout so navigation never destroys the iframe bound via id="yt-audio-player". */}
      <div
        className="fixed -bottom-[9999px] -right-[9999px] -z-50 opacity-0 pointer-events-none w-[220px] h-[200px]"
        aria-hidden="true"
      >
        <div id="yt-audio-player" />
      </div>

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
        relatedTracks={s.relatedTracks}
        loadingRelated={s.loadingRelated}
        clock={s.clock}
        onClose={() => s.setNowPlayingOpen(false)}
        onTabChange={s.setNowPlayingTab}
        onCycleLyricVariant={s.cycleLyricVariant}
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