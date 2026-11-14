import assert from "node:assert/strict";
import type { Track } from "@/actions/ytm-core";
import {
  clearQueueKeepCurrent,
  createPlaylistId,
  isPlaylistId,
  migratePlaylistIds,
  resolveExploreFallbackQueue,
  resolveReadyAction,
  resolveRestoredIndex,
  resolveTrackSwitch,
  shouldAcceptPlayerEvent,
  shouldAttemptBackgroundResume,
  shouldRestorePlayerAudio,
} from "./player-state";
import { isAlbumId, isArtistId, normalizePlaylistId, ROUTES, routeFromLocation, safeDecode } from "./routes";
import {
  applyRoomCommand,
  computeRoomTime,
  createRoomState,
  generateMemberIcon,
  generateMemberName,
  makeRoomCode,
  MEMBER_AVATARS,
  normalizeTrack,
  parseMemberIcon,
  sanitizeMemberName,
  sanitizeQueue,
} from "./room";

const makeTrack = (id: string): Track => ({
  id,
  title: `Song ${id}`,
  channel: "Artist",
  duration: "3:00",
  thumbnail: "",
});

const a = makeTrack("vid_A");
const b = makeTrack("vid_B");
const c = makeTrack("vid_C");

// 1. Explore response must NEVER overwrite user-started playback
assert.deepEqual(
  resolveExploreFallbackQueue([b], true, [a, c]),
  [b],
  "explore must not overwrite active user queue"
);
assert.deepEqual(
  resolveExploreFallbackQueue([], true, [a, c]),
  [],
  "explore must not seed if user already initiated playback"
);
assert.deepEqual(
  resolveExploreFallbackQueue([], false, [a, c]),
  [a, c],
  "explore seeds empty queue on cold start"
);

// 2. Clearing queue must reset index to 0 and keep currently playing track
assert.deepEqual(clearQueueKeepCurrent([a, b, c], 2), {
  queue: [c],
  index: 0,
});

// 3. Switching track resolves exact queue & index
assert.deepEqual(resolveTrackSwitch(b, [a, b, c], [a]), {
  queue: [a, b, c],
  index: 1,
});
assert.deepEqual(resolveTrackSwitch(c, undefined, [a, b]), {
  queue: [c, a, b],
  index: 0,
});

// 4. Restored session aligns index with activeTrackId
assert.equal(
  resolveRestoredIndex({ queue: [a, b, c], currentIndex: 0, activeTrackId: "vid_C" }),
  2
);

// 5. Booting player loads newer track if user switched before onReady
assert.deepEqual(
  resolveReadyAction("vid_A", { videoId: "vid_B", seekTo: 0, autoPlay: true }),
  { type: "load", videoId: "vid_B", seekTo: 0 }
);
assert.deepEqual(
  resolveReadyAction("vid_A", { videoId: "vid_A", seekTo: 42, autoPlay: true }),
  { type: "resume_initial", seekTo: 42, autoPlay: true }
);
assert.deepEqual(
  resolveReadyAction("vid_A", { videoId: "vid_A", seekTo: 42, autoPlay: false }),
  { type: "resume_initial", seekTo: 42, autoPlay: false }
);
assert.deepEqual(
  resolveReadyAction("vid_A", { videoId: "vid_B", seekTo: 42, autoPlay: false }),
  { type: "cue", videoId: "vid_B", seekTo: 42 }
);

// 6. Stale player events during track switch must be rejected
assert.equal(shouldAcceptPlayerEvent("vid_A", "vid_B", "vid_B", 2, false), false);
assert.equal(shouldAcceptPlayerEvent("", "vid_B", "vid_B", 2, false), false);
assert.equal(shouldAcceptPlayerEvent("vid_B", "vid_B", "vid_B", 1, true), true);
assert.equal(shouldAcceptPlayerEvent("", "vid_B", "vid_B", 1, true), true);
assert.equal(shouldAcceptPlayerEvent("vid_A", "vid_B", null, 1, false), false);
assert.equal(shouldAcceptPlayerEvent("vid_B", "vid_B", null, 1, false), true);

// 7. Room state sync & baseVersion conflict guard
// ID panjang (>=6) karena payload room di-whitelist oleh normalizeTrack.
const ra = makeTrack("vid_AAAA");
const rb = makeTrack("vid_BBBB");
const rc = makeTrack("vid_CCCC");
const room0 = createRoomState({
  code: "ABC123",
  clientId: "u1",
  clientName: "  Chill   Panda  ",
  clientIcon: "fox",
  queue: [ra, rb, rc],
  currentIndex: 0,
  currentTime: 10,
  isPlaying: true,
  now: 1000,
});
assert.equal(computeRoomTime(room0, 6000), 15);
assert.deepEqual(room0.members, [{ id: "u1", name: "Chill Panda", icon: "fox" }]);
assert.equal(sanitizeMemberName("   "), "");
assert.equal(sanitizeMemberName("  A".repeat(20)).length, 24);
assert.equal(generateMemberName().includes(" "), true);
assert.equal(parseMemberIcon("fox"), "fox");
assert.equal(parseMemberIcon("invalid_icon"), null);
assert.notEqual(parseMemberIcon(generateMemberIcon()), null);
assert.equal(MEMBER_AVATARS.length, 10);
assert.equal(MEMBER_AVATARS[0].id, "fox");

const paused = applyRoomCommand(room0, { type: "pause" }, "u2", 6000);
assert.equal(paused.changed, true);
assert.equal(paused.room.isPlaying, false);
assert.equal(paused.room.anchorTime, 15);
assert.equal(computeRoomTime(paused.room, 20000), 15);

const next1 = applyRoomCommand(paused.room, { type: "next", baseVersion: 2 }, "u2", 7000);
assert.equal(next1.changed, true);
assert.equal(next1.room.currentIndex, 1);
assert.equal(next1.room.version, 3);

// Stale auto-next from another listener with old baseVersion must be ignored
const nextStale = applyRoomCommand(next1.room, { type: "next", baseVersion: 2 }, "u3", 7100);
assert.equal(nextStale.changed, false);
assert.equal(nextStale.room.currentIndex, 1);

// Prev > 4s restarts track, <= 4s goes previous track
const prevRestart = applyRoomCommand(next1.room, { type: "prev", atTime: 8 }, "u1", 8000);
assert.equal(prevRestart.room.currentIndex, 1);
assert.equal(prevRestart.room.anchorTime, 0);
const prevBack = applyRoomCommand(prevRestart.room, { type: "prev", atTime: 2 }, "u1", 9000);
assert.equal(prevBack.room.currentIndex, 0);

// 7b. Lyrics variant & offset sync in room, reset on track switch
const lyricSynced = applyRoomCommand(
  next1.room,
  { type: "setLyrics", variantIdx: 2, offset: -1.5 },
  "u2",
  9200
);
assert.equal(lyricSynced.changed, true);
assert.equal(lyricSynced.room.lyricVariantIdx, 2);
assert.equal(lyricSynced.room.lyricOffset, -1.5);
const lyricAfterNext = applyRoomCommand(lyricSynced.room, { type: "next" }, "u1", 9500);
assert.equal(lyricAfterNext.room.lyricVariantIdx, 0);
assert.equal(lyricAfterNext.room.lyricOffset, 0);

// 8. Generated room codes never collide with existing or retired codes
const seen = new Set<string>();
for (let i = 0; i < 200; i++) {
  const code = makeRoomCode(seen);
  assert.equal(seen.has(code), false);
  seen.add(code);
}
const fallbackCode = makeRoomCode({ has: (c) => c.length === 6 });
assert.equal(fallbackCode.length > 6, true);

// 9. Background iframe pause recovery guard
assert.equal(
  shouldAttemptBackgroundResume({
    isHidden: true,
    wasPlaying: true,
    hiddenAtMs: 1000,
    manualPauseAtMs: 0,
    nowMs: 1200,
    retryCount: 0,
  }),
  true
);
assert.equal(
  shouldAttemptBackgroundResume({
    isHidden: true,
    wasPlaying: true,
    hiddenAtMs: 1000,
    manualPauseAtMs: 1100,
    nowMs: 1250,
    retryCount: 0,
  }),
  false,
  "manual pause must not auto-resume"
);
assert.equal(
  shouldAttemptBackgroundResume({
    isHidden: false,
    wasPlaying: true,
    hiddenAtMs: 1000,
    manualPauseAtMs: 0,
    nowMs: 1200,
    retryCount: 0,
  }),
  false,
  "visible tab pause must not auto-resume"
);
assert.equal(
  shouldAttemptBackgroundResume({
    isHidden: true,
    wasPlaying: true,
    hiddenAtMs: 1000,
    manualPauseAtMs: 0,
    nowMs: 1800,
    retryCount: 2,
  }),
  true
);
assert.equal(
  shouldAttemptBackgroundResume({
    isHidden: true,
    wasPlaying: true,
    hiddenAtMs: 1000,
    manualPauseAtMs: 0,
    nowMs: 1800,
    retryCount: 4,
  }),
  false,
  "retry budget cap prevents infinite loop"
);

// 10. Silent-playback audio restore guard
assert.equal(shouldRestorePlayerAudio(true, 80, false, 80), true);
assert.equal(shouldRestorePlayerAudio(false, 0, false, 80), true);
assert.equal(shouldRestorePlayerAudio(false, 80, false, 80), false);
assert.equal(shouldRestorePlayerAudio(true, 0, true, 80), false);

// Playlist id berupa UUID v4 -> URL tidak berubah saat nama playlist di-rename.
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
assert.match(createPlaylistId(), uuidV4, "playlist id is a UUID v4");
const playlistIds = new Set(Array.from({ length: 1000 }, () => createPlaylistId()));
assert.equal(playlistIds.size, 1000, "playlist ids are unique");

// 11. Validasi id playlist: hanya UUID yang boleh masuk URL.
assert.equal(isPlaylistId(createPlaylistId()), true);
assert.equal(isPlaylistId("  9F1C2A3E-1B2C-4D5E-8F90-123456789ABC  ".trim()), true);
assert.equal(isPlaylistId("pl_1730000000"), false);
assert.equal(isPlaylistId("my-playlist"), false);
assert.equal(isPlaylistId(""), false);

// 12. Migrasi playlist lama: id non-UUID diganti, id lama dipetakan ke UUID baru.
const legacyPlaylists = [
  { id: "pl_1730000000", name: "Chill", tracks: [] },
  { id: "9f1c2a3e-1b2c-4d5e-8f90-123456789abc", name: "Focus", tracks: [] },
  { id: "PL_1730000001", name: "Night", tracks: [] },
];
const migrated = migratePlaylistIds(legacyPlaylists);
assert.equal(migrated.playlists.length, 3);
assert.equal(isPlaylistId(migrated.playlists[0].id), true);
assert.equal(migrated.playlists[1].id, legacyPlaylists[1].id, "UUID lama dipertahankan");
assert.equal(isPlaylistId(migrated.playlists[2].id), true);
assert.equal(migrated.aliases["pl_1730000000"], migrated.playlists[0].id);
assert.equal(migrated.aliases["pl_1730000001"], migrated.playlists[2].id);
assert.equal(migrated.playlists[0].name, "Chill", "nama playlist tidak berubah");

// Idempoten: playlist yang sudah UUID tidak dimigrasi ulang.
const again = migratePlaylistIds(migrated.playlists);
assert.equal(again.playlists, migrated.playlists, "tidak ada perubahan kedua");
assert.deepEqual(again.aliases, {});

// Kolisi id: dua playlist dengan id sama tetap mendapat id unik.
const dup = migratePlaylistIds([
  { id: "pl_1", name: "A", tracks: [] },
  { id: "pl_1", name: "B", tracks: [] },
]);
assert.notEqual(dup.playlists[0].id, dup.playlists[1].id);

// 13. URL playlist: id di-encode, hanya UUID yang dinormalisasi ke huruf kecil.
assert.equal(ROUTES.playlist("a/b?c#d"), "/library/playlist/a%2Fb%3Fc%23d");
assert.equal(
  normalizePlaylistId(" 9F1C2A3E-1B2C-4D5E-8F90-123456789ABC "),
  "9f1c2a3e-1b2c-4d5e-8f90-123456789abc"
);
assert.equal(normalizePlaylistId("PL_1730000000"), "PL_1730000000", "id lama tidak diubah");
assert.equal(
  routeFromLocation("/library/playlist/9f1c2a3e-1b2c-4d5e-8f90-123456789abc", "").entityId,
  "9f1c2a3e-1b2c-4d5e-8f90-123456789abc"
);
assert.equal(routeFromLocation("/library/pl_1730000000", "").tab, "playlist");

// 14. Album & artist id: validasi ketat, path rusak jatuh ke halaman daftar.
assert.equal(isAlbumId("MPREb_9FakeAlbum123"), true);
assert.equal(isAlbumId("ab"), false);
assert.equal(isAlbumId("../../etc/passwd"), false);
assert.equal(isAlbumId("MPREb_9Fake/Album"), false);
assert.equal(isArtistId("UCabcdefghijklmnopqrstuv"), true);
assert.equal(isArtistId("UCshort"), false);
assert.equal(isArtistId("MPREb_9FakeAlbum123"), false);

const badAlbum = routeFromLocation("/albums/ab", "");
assert.equal(badAlbum.tab, "albums");
assert.equal(badAlbum.entityId, undefined, "album id invalid tidak dipakai");
assert.equal(badAlbum.path, ROUTES.albums);
const badArtist = routeFromLocation("/artists/not-a-channel", "");
assert.equal(badArtist.tab, "artists");
assert.equal(badArtist.entityId, undefined, "artist id invalid tidak dipakai");
assert.equal(badArtist.path, ROUTES.artists);

// 15. URL malformed tidak boleh throw; playlist junk kembali ke Library.
assert.equal(safeDecode("%"), "%");
assert.equal(safeDecode("MPREb_9FakeAlbum123"), "MPREb_9FakeAlbum123");
assert.equal(routeFromLocation("/library/playlist/%", "").tab, "library");
assert.equal(routeFromLocation("/library/playlist/%2Fetc", "").tab, "library");

// 16. Payload room di-whitelist: field asing dibuang, URL non-https ditolak,
// karakter kontrol dibersihkan, dan panjang queue dibatasi.
assert.equal(sanitizeMemberName("  Ali\u0000ce\u200b  "), "Alice", "nama dibersihkan");
assert.equal(sanitizeMemberName("x".repeat(50)).length, 24, "nama dibatasi 24 char");

assert.equal(normalizeTrack({ id: "bad id!" }), null, "id video invalid ditolak");
assert.equal(normalizeTrack("not-an-object"), null);
assert.equal(normalizeTrack(null), null);

const cleaned = normalizeTrack({
  id: "dQw4w9WgXcQ",
  title: "Hello\u0000 World",
  channel: "Some Channel",
  duration: "3:21",
  thumbnail: "javascript:alert(1)",
  evil: "drop me",
});
assert.ok(cleaned);
assert.equal(cleaned!.title, "Hello World");
assert.equal(cleaned!.thumbnail, "", "thumbnail non-https dibuang");
assert.equal(cleaned!.duration, "3:21");
assert.equal("evil" in cleaned!, false, "field asing dibuang");
assert.equal(
  normalizeTrack({ id: "dQw4w9WgXcQ", thumbnail: "https://i.ytimg.com/vi/x/mqdefault.jpg" })!.thumbnail,
  "https://i.ytimg.com/vi/x/mqdefault.jpg"
);

const queueInput = [
  { id: "dQw4w9WgXcQ", title: "A" },
  { id: "bad id!" },
  { id: "abcdefghijk", title: "B" },
];
assert.equal(sanitizeQueue(queueInput).length, 2, "track invalid dibuang");
assert.equal(
  sanitizeQueue(queueInput, 1).length,
  1,
  "queue dibatasi sesuai max"
);
assert.deepEqual(sanitizeQueue("nope"), [], "non-array jadi queue kosong");

console.log("ALL_PLAYER_STATE_CHECKS_PASSED");
