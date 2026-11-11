import assert from "node:assert/strict";
import type { Track } from "@/actions/youtube";
import {
  clearQueueKeepCurrent,
  resolveExploreFallbackQueue,
  resolveReadyAction,
  resolveRestoredIndex,
  resolveTrackSwitch,
  shouldAcceptPlayerEvent,
} from "@/lib/player-state";

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

console.log("ALL_PLAYER_STATE_CHECKS_PASSED");
