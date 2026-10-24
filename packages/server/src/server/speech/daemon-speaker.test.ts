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

// Later clients were active more recently: client 0 is the stalest.
function createClients(count: number) {
  const received: SessionOutboundMessage[][] = Array.from({ length: count }, () => []);
  const sessions = received.map((messages, index) => ({
    isAppClient: () => true,
    lastInteractionAt: () => 1000 + index,
    lastUserPromptAt: (_agentId: string) => 0,
    sendToAllSources: (message: SessionOutboundMessage) => {
      messages.push(message);
    },
  }));
  return { received, sessions };
}

function createSpeaker(options: {
  tts?: TextToSpeechProvider | null;
  sessions: Array<{
    isAppClient: () => boolean;
    lastInteractionAt: () => number;
    lastUserPromptAt: (agentId: string) => number;
    sendToAllSources: (message: SessionOutboundMessage) => void;
  }>;
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
  it("plays on the most recently active app client only and resolves on its confirmation", async () => {
    const { received, sessions } = createClients(2);
    const speaker = createSpeaker({ sessions });

    const playback = speaker.speak({ text: "Spoken report.", callerAgentId: "agent-1" });
    await vi.waitFor(() => expect(received[1]).toHaveLength(1));

    expect(received[1][0]).toMatchObject({
      type: "audio_output",
      payload: { isVoiceMode: false, isLastChunk: true },
    });
    expect(received[0]).toHaveLength(0);
    const message = received[1][0];
    if (message.type !== "audio_output") throw new Error("expected audio_output");

    expect(speaker.confirmAudioPlayed(message.payload.id)).toBe(true);
    await playback;
    expect(speaker.confirmAudioPlayed(message.payload.id)).toBe(true);
  });

  it("plays on the client where Des last typed a prompt in this agent's chat, not the busiest client", async () => {
    const { received, sessions } = createClients(2);
    // Client 1 is busier (newer interaction), but Des typed in this chat on client 0.
    sessions[0].lastUserPromptAt = (agentId) => (agentId === "agent-1" ? 500 : 0);
    sessions[1].lastUserPromptAt = (agentId) => (agentId === "agent-2" ? 900 : 0);
    const speaker = createSpeaker({ sessions });

    const playback = speaker.speak({ text: "Spoken report.", callerAgentId: "agent-1" });
    await vi.waitFor(() => expect(received[0]).toHaveLength(1));
    expect(received[1]).toHaveLength(0);
    const message = received[0][0];
    if (message.type !== "audio_output") throw new Error("expected audio_output");
    speaker.confirmAudioPlayed(message.payload.id);
    await playback;
  });

  it("keeps playing on the same client for a whole report, then re-picks for the next", async () => {
    const { received, sessions } = createClients(2);
    const speaker = createSpeaker({ sessions });
    const confirmAll = (index: number) => {
      for (const message of received[index]) {
        if (message.type === "audio_output") speaker.confirmAudioPlayed(message.payload.id);
      }
    };

    const first = speaker.speak({
      text: "One sentence. Another sentence.",
      callerAgentId: "agent-1",
    });
    // Every sentence arrives before playback starts, as one chunk group the app plays as a
    // single clip, so there is no gap between sentences for a car's Bluetooth to drop in.
    await vi.waitFor(() => expect(received[1]).toHaveLength(2));
    const [one, another] = received[1];
    if (one.type !== "audio_output" || another.type !== "audio_output") {
      throw new Error("expected audio_output");
    }
    expect(one.payload.groupId).toBe(another.payload.groupId);
    expect([one.payload.isLastChunk, another.payload.isLastChunk]).toEqual([false, true]);
    // The stale client becomes the active one mid-report; the report stays where it started.
    sessions[0].lastInteractionAt = () => 5000;
    confirmAll(1);
    await first;
    expect(received[0]).toHaveLength(0);

    const second = speaker.speak({ text: "Next report.", callerAgentId: "agent-1" });
    await vi.waitFor(() => expect(received[0]).toHaveLength(1));
    confirmAll(0);
    await second;
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

  it("ignores plugin and CLI sessions: they neither count as clients nor get the audio", async () => {
    const plugin: SessionOutboundMessage[] = [];
    const pluginSession = {
      isAppClient: () => false,
      lastInteractionAt: () => 9999,
      lastUserPromptAt: () => 9999,
      sendToAllSources: (message: SessionOutboundMessage) => {
        plugin.push(message);
      },
    };
    const noApp = createSpeaker({ sessions: [pluginSession] });
    await expect(noApp.speak({ text: "Hello.", callerAgentId: "agent-1" })).rejects.toThrow(
      "No app client is connected",
    );

    const { received, sessions } = createClients(1);
    const speaker = createSpeaker({ sessions: [pluginSession, ...sessions] });
    const playback = speaker.speak({ text: "Hello.", callerAgentId: "agent-1" });
    await vi.waitFor(() => expect(received[0]).toHaveLength(1));
    const message = received[0][0];
    if (message.type !== "audio_output") throw new Error("expected audio_output");
    speaker.confirmAudioPlayed(message.payload.id);
    await playback;
    expect(plugin).toHaveLength(0);
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
