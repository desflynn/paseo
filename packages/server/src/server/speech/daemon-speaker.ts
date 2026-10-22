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
  /** When the client last did something (not a heartbeat), in epoch milliseconds. */
  lastInteractionAt(): number;
  /** When the user last typed a prompt to this agent on this client; 0 if never. */
  lastUserPromptAt(agentId: string): number;
  sendToAllSources(message: SessionOutboundMessage): void;
}

export interface DaemonSpeaker {
  /** The `speak` tool handler for agents that have no voice session of their own. */
  speak: VoiceSpeakHandler;
  /** True when the id belongs to audio this speaker sent. */
  confirmAudioPlayed(chunkId: string): boolean;
}

function mostRecentlyActive(sessions: DaemonSpeakerSession[]): DaemonSpeakerSession | null {
  let best: DaemonSpeakerSession | null = null;
  for (const session of sessions) {
    if (!best || session.lastInteractionAt() >= best.lastInteractionAt()) best = session;
  }
  return best;
}

/**
 * The client where Des last typed a prompt in this agent's chat. Prompts from other agents
 * do not count. With no such prompt on any client, the most recently active client.
 */
function pickPlayer(
  sessions: DaemonSpeakerSession[],
  agentId: string,
): DaemonSpeakerSession | null {
  let best: DaemonSpeakerSession | null = null;
  for (const session of sessions) {
    const promptAt = session.lastUserPromptAt(agentId);
    if (promptAt > 0 && (!best || promptAt >= best.lastUserPromptAt(agentId))) best = session;
  }
  return best ?? mostRecentlyActive(sessions);
}

/**
 * Speaks for agents outside chat mode. Audio goes to the app client where Des last typed in the agent\'s chat, with
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

    // One client plays a whole report: the one Des last typed in. Every connected client
    // playing it at once sounds like an echo.
    let player: DaemonSpeakerSession | null = null;
    const timeout = AbortSignal.timeout(playbackTimeoutMs);
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    await ttsManager.generateAndWaitForPlayback(
      text,
      (message) => {
        const sessions = listAppSessions();
        if (!player || !sessions.includes(player)) player = pickPlayer(sessions, callerAgentId);
        logger.info(
          { agentId: callerAgentId, messageType: message.type, appClients: sessions.length },
          "Daemon speak sending audio to the client of the last user prompt",
        );
        player?.sendToAllSources(message);
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
