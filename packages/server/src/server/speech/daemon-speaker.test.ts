import { Readable } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import type { SessionOutboundMessage } from "../messages.js";
import { createDaemonSpeaker } from "./daemon-speaker.js";
import type { TextToSpeechProvider } from "./speech-provider.js";

const tts: TextToSpeechProvider = {
  async synthesizeSpeech() {
    return { stream: Readable.from([Buffer.from("audio")]), format: "pcm;rate=24000" };
  },
};

function createClients(count: number) {
  const received: SessionOutboundMessage[][] = Array.from({ length: count }, () => []);
  const sessions = received.map((messages) => ({
    emitServerMessage: (message: SessionOutboundMessage) => {
      messages.push(message);
    },
  }));
  return { received, sessions };
}

function createSpeaker(options: {
  tts?: TextToSpeechProvider | null;
  sessions: Array<{ emitServerMessage: (message: SessionOutboundMessage) => void }>;
  playbackTimeoutMs?: number;
}) {
  return createDaemonSpeaker({
    logger: pino({ level: "silent" }),
    resolveTts: () => (options.tts === undefined ? tts : options.tts),
    listSessions: () => options.sessions,
    playbackTimeoutMs: options.playbackTimeoutMs,
  });
}

describe("createDaemonSpeaker", () => {
  it("broadcasts audio to every client as non-voice-mode and resolves on the first confirmation", async () => {
    const { received, sessions } = createClients(2);
    const speaker = createSpeaker({ sessions });

    const playback = speaker.speak({ text: "Spoken report.", callerAgentId: "agent-1" });
    await vi.waitFor(() => expect(received[0]).toHaveLength(1));

    for (const messages of received) {
      expect(messages[0]).toMatchObject({
        type: "audio_output",
        payload: { isVoiceMode: false, isLastChunk: true },
      });
    }
    const message = received[0][0];
    if (message.type !== "audio_output") throw new Error("expected audio_output");

    // The phone confirms first; the desktop confirms late and is ignored.
    expect(speaker.confirmAudioPlayed(message.payload.id)).toBe(true);
    await playback;
    expect(speaker.confirmAudioPlayed(message.payload.id)).toBe(true);
  });

  it("does not claim a confirmation for audio it did not send", () => {
    const { sessions } = createClients(1);
    const speaker = createSpeaker({ sessions });

    expect(speaker.confirmAudioPlayed("voice-session-audio:0")).toBe(false);
  });

  it("rejects when no app client is connected", async () => {
    const speaker = createSpeaker({ sessions: [] });

    await expect(speaker.speak({ text: "Hello.", callerAgentId: "agent-1" })).rejects.toThrow(
      "No app client is connected",
    );
  });

  it("rejects when TTS is not configured", async () => {
    const { sessions } = createClients(1);
    const speaker = createSpeaker({ sessions, tts: null });

    await expect(speaker.speak({ text: "Hello.", callerAgentId: "agent-1" })).rejects.toThrow(
      "TTS not configured",
    );
  });

  it("rejects when no client confirms playback in time", async () => {
    const { sessions } = createClients(1);
    const speaker = createSpeaker({ sessions, playbackTimeoutMs: 30 });

    await expect(speaker.speak({ text: "Hello.", callerAgentId: "agent-1" })).rejects.toThrow(
      "No app client confirmed playback",
    );
  });

  it("stops when the calling tool aborts", async () => {
    const { received, sessions } = createClients(1);
    const speaker = createSpeaker({ sessions });
    const abort = new AbortController();

    const playback = speaker.speak({
      text: "Hello.",
      callerAgentId: "agent-1",
      signal: abort.signal,
    });
    await vi.waitFor(() => expect(received[0]).toHaveLength(1));
    abort.abort();

    await expect(playback).resolves.toBeUndefined();
  });
});
