import { expect, test } from "vitest";

import { createSpeakGroupStream } from "./speak-group";
import type { BufferedAudioChunk } from "./group-playback";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

interface StreamHarness {
  plays: string[];
  confirms: string[];
  doneCount: number;
  failOn: Set<string>;
  push(chunkIndex: number, isLast?: boolean): void;
  abort(): void;
}

function chunk(index: number): BufferedAudioChunk {
  return { chunkIndex: index, audio: "0000", format: "pcm", id: `group:${index}` };
}

function harness(): StreamHarness {
  const plays: string[] = [];
  const confirms: string[] = [];
  let doneCount = 0;
  const failOn = new Set<string>();
  const stream = createSpeakGroupStream({
    buildSource: (c) => c as never,
    play: async (source) => {
      const id = (source as unknown as BufferedAudioChunk).id;
      plays.push(id);
      if (failOn.has(id)) throw new Error("Playback stopped");
      return 1;
    },
    confirm: async (chunkId) => {
      confirms.push(chunkId);
    },
    onGroupDone: () => {
      doneCount += 1;
    },
  });
  return {
    plays,
    confirms,
    get doneCount() {
      return doneCount;
    },
    failOn,
    push(index, isLast = false) {
      stream.push({ ...chunk(index), isLast });
    },
    abort: stream.abort,
  };
}

test("plays chunks in chunkIndex order as they arrive and confirms each after it plays", async () => {
  const h = harness();
  h.push(0);
  h.push(1);
  h.push(2, true);

  await tick();
  await tick();

  expect(h.plays).toEqual(["group:0", "group:1", "group:2"]);
  expect(h.confirms).toEqual(["group:0", "group:1", "group:2"]);
  expect(h.doneCount).toBe(1);
});

test("a chunk arriving before its predecessor is held until order is restorable", async () => {
  const h = harness();
  h.push(1);
  await tick();
  expect(h.plays).toEqual([]);

  h.push(0);
  await tick();
  await tick();
  expect(h.plays).toEqual(["group:0", "group:1"]);
});

test("the group finishes only after the last chunk has played", async () => {
  const h = harness();
  h.push(0);
  h.push(1, true);
  await tick();
  // After chunk 0's play resolved, chunk 1 has been enqueued but not finished.
  expect(h.plays).toEqual(["group:0", "group:1"]);

  await tick();
  expect(h.doneCount).toBe(1);
});

test("a late duplicate is confirmed immediately without replaying", async () => {
  const h = harness();
  h.push(0, true);
  await tick();
  await tick();
  expect(h.plays).toEqual(["group:0"]);
  expect(h.doneCount).toBe(1);

  h.push(0);
  await tick();
  expect(h.plays).toEqual(["group:0"]);
  expect(h.confirms).toEqual(["group:0", "group:0"]);
  expect(h.doneCount).toBe(1);
});

test("a play failure confirms the arrived chunks and finishes the group", async () => {
  const h = harness();
  h.failOn.add("group:1");
  h.push(0);
  h.push(1);
  h.push(2, true);

  await tick();
  await tick();

  expect(h.plays).toEqual(["group:0", "group:1"]);
  expect(h.confirms).toEqual(["group:0", "group:1", "group:2"]);
  expect(h.doneCount).toBe(1);
});

test("chunks pushed after a failure are confirmed but never played", async () => {
  const h = harness();
  h.failOn.add("group:0");
  h.push(0, true);
  await tick();
  await tick();
  expect(h.doneCount).toBe(1);

  h.push(1);
  await tick();
  expect(h.plays).toEqual(["group:0"]);
  expect(h.confirms).toEqual(["group:0", "group:1"]);
});

test("abort confirms unplayed arrivals and finishes exactly once", async () => {
  const h = harness();
  h.push(0);
  h.push(2);
  h.abort();

  await tick();
  await tick();
  // Chunk 0 was already in flight when abort landed; chunk 2 never plays.
  expect(h.plays).toEqual(["group:0"]);
  expect([...h.confirms].sort()).toEqual(["group:0", "group:2"]);
  expect(h.doneCount).toBe(1);

  h.push(3);
  await tick();
  expect(h.plays).toEqual(["group:0"]);
  expect(h.confirms).toHaveLength(3);
});
