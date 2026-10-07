import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readAudio } from "../server/read-audio.ts";
import { MAX_AUDIO_BYTES, audioMimeFromPath, readAudioRpc } from "./read-audio.ts";

test("read-audio contract keeps the read-image shape", () => {
  assert.equal(readAudioRpc.name, "read-audio");
  assert.equal(MAX_AUDIO_BYTES, 16 * 1024 * 1024);
});

test("audioMimeFromPath allowlists mp3/m4a/wav/ogg and rejects the rest", () => {
  assert.equal(audioMimeFromPath("/a/b/report.mp3"), "audio/mpeg");
  assert.equal(audioMimeFromPath("/a/b/voice.M4A"), "audio/mp4");
  assert.equal(audioMimeFromPath("/a/b/tone.wav"), "audio/wav");
  assert.equal(audioMimeFromPath("/a/b/take.ogg"), "audio/ogg");
  assert.equal(audioMimeFromPath("/a/b/notes.txt"), null);
  assert.equal(audioMimeFromPath("/a/b/pic.png"), null);
  assert.equal(audioMimeFromPath("not-a-path"), null);
});

test("read-audio returns base64 for a small temp mp3", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const path = join(dir, "clip.mp3");
    const bytes = Uint8Array.from([0xff, 0xfb, 0x10, 0x00, 0x01, 0x02]);
    await writeFile(path, bytes);
    const result = await readAudio({ path });
    assert.deepEqual(result, {
      ok: true,
      mime: "audio/mpeg",
      base64: Buffer.from(bytes).toString("base64"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("read-audio rejects unsupported extensions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const path = join(dir, "notes.txt");
    await writeFile(path, "hello");
    const result = await readAudio({ path });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /unsupported audio type/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("read-audio rejects files over the 16 MiB cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const path = join(dir, "big.mp3");
    await writeFile(path, "");
    await truncate(path, MAX_AUDIO_BYTES + 1); // sparse: stat size counts, bytes never written
    const result = await readAudio({ path });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /audio too large/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("read-audio reports missing files as an error result", async () => {
  const result = await readAudio({ path: "/nonexistent/sm-audio/clip.mp3" });
  assert.equal(result.ok, false);
});

test("read-audio rejects relative paths", async () => {
  const result = await readAudio({ path: "relative/clip.mp3" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not an absolute path/);
});
