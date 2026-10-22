import type pino from "pino";

import { TTSManager } from "../agent/tts-manager.js";
import type { SessionOutboundMessage } from "../messages.js";
import type { VoiceSpeakHandler } from "../voice-types.js";
import type { TextToSpeechProvider } from "./speech-provider.js";

// A 4000 character report plays for about five minutes; leave room for synthesis.
const DEFAULT_PLAYBACK_TIMEOUT_MS = 10 * 60 * 1000;

interface DaemonSpeakerSession {
  /** Mobile and browser/desktop app sessions play audio; plugin, CLI and MCP sessions do not. */
  isAppClient(): boolean;
  sendToAllSources(message: SessionOutboundMessage): void;
}

export interface DaemonSpeaker {
  /** The `speak` tool handler for agents that have no voice session of their own. */
  speak: VoiceSpeakHandler;
  /** True when the id belongs to audio this speaker sent. */
  confirmAudioPlayed(chunkId: string): boolean;
}

/**
 * Speaks for agents outside chat mode. Audio goes to every connected app client with
 * isVoiceMode false, which the app plays without a voice session. Clients answer with
 * audio_played; the first answer per chunk resolves the call, later ones are ignored.
 */
export function createDaemonSpeaker(options: {
  logger: pino.Logger;
  resolveTts: () => TextToSpeechProvider | null;
  listSessions: () => DaemonSpeakerSession[];
  playbackTimeoutMs?: number;
}): DaemonSpeaker {
  const { logger, resolveTts, listSessions } = options;
  const playbackTimeoutMs = options.playbackTimeoutMs ?? DEFAULT_PLAYBACK_TIMEOUT_MS;
  const ttsManager = new TTSManager("daemon-speaker", logger, resolveTts);
  const listAppSessions = () => listSessions().filter((session) => session.isAppClient());

  const speak: VoiceSpeakHandler = async ({ text, callerAgentId, signal }) => {
    if (!resolveTts()) {
      throw new Error("TTS not configured");
    }
    if (listAppSessions().length === 0) {
      throw new Error("No app client is connected to play speech");
    }
    logger.info({ agentId: callerAgentId, textLength: text.length }, "Daemon speak tool call");

    const timeout = AbortSignal.timeout(playbackTimeoutMs);
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    await ttsManager.generateAndWaitForPlayback(
      text,
      (message) => {
        const sessions = listAppSessions();
        logger.info(
          { agentId: callerAgentId, messageType: message.type, appClients: sessions.length },
          "Daemon speak sending audio to app clients",
        );
        for (const session of sessions) {
          session.sendToAllSources(message);
        }
      },
      abortSignal,
      false,
    );
    if (timeout.aborted && !signal?.aborted) {
      throw new Error("No app client confirmed playback");
    }
  };

  return {
    speak,
    confirmAudioPlayed: (chunkId) => {
      const known = ttsManager.confirmAudioPlayed(chunkId);
      if (known) logger.info({ chunkId }, "Daemon speak playback confirmed by an app client");
      return known;
    },
  };
}
