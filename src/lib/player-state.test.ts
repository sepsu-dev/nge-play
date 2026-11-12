import assert from "node:assert/strict";
import type { Track } from "@/actions/youtube";
import {
  clearQueueKeepCurrent,
  resolveExploreFallbackQueue,
  resolveReadyAction,
  resolveRestoredIndex,
  resolveTrackSwitch,
  shouldAcceptPlayerEvent,
  shouldAttemptBackgroundResume,
} from "@/lib/player-state";
import { applyRoomCommand, computeRoomTime, createRoomState, makeRoomCode } from "@/lib/room";

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

// 6. Stale player events during track switch must be rejected
assert.equal(shouldAcceptPlayerEvent("vid_A", "vid_B", "vid_B", 2, false), false);
assert.equal(shouldAcceptPlayerEvent("", "vid_B", "vid_B", 2, false), false);
assert.equal(shouldAcceptPlayerEvent("vid_B", "vid_B", "vid_B", 1, true), true);
assert.equal(shouldAcceptPlayerEvent("", "vid_B", "vid_B", 1, true), true);
assert.equal(shouldAcceptPlayerEvent("vid_A", "vid_B", null, 1, false), false);
assert.equal(shouldAcceptPlayerEvent("vid_B", "vid_B", null, 1, false), true);

// 7. Room state sync & baseVersion conflict guard
const room0 = createRoomState({
  code: "ABC123",
  clientId: "u1",
  queue: [a, b, c],
  currentIndex: 0,
  currentTime: 10,
  isPlaying: true,
  now: 1000,
});
assert.equal(computeRoomTime(room0, 6000), 15);

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
  false,
  "retry budget cap prevents infinite loop"
);

console.log("ALL_PLAYER_STATE_CHECKS_PASSED");
