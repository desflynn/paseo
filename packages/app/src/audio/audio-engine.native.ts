import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioEngineOptions,
  AudioPlaybackSource,
} from "./audio-engine-types";

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { createPlaybackQueue } from "./playback";
import { playFile } from "./file-playback";
import { playPcm16 } from "./pcm";

export function createAudioEngine(
  callbacks: AudioEngineCallbacks,
  options?: AudioEngineOptions & {
    /** Test seam: the duplex-engine native module. */
    nativeModule?: typeof import("@getpaseo/expo-two-way-audio");
  },
): AudioEngine {
  const native = options?.nativeModule ?? require("@getpaseo/expo-two-way-audio");

  const refs: {
    initialized: boolean;
    captureActive: boolean;
    muted: boolean;
    destroyed: boolean;
    playbackMuted: boolean;
    duplexPlaying: boolean;
    activePlayer: { volume?: number } | null;
  } = {
    initialized: false,
    captureActive: false,
    muted: false,
    playbackMuted: false,
    duplexPlaying: false,
    activePlayer: null,
    destroyed: false,
  };

  const microphoneSubscription = native.addExpoTwoWayAudioEventListener(
    "onMicrophoneData",
    (event: { data: Uint8Array }) => {
      if (!refs.captureActive || refs.muted) {
        return;
      }
      const pcm = event.data;
      callbacks.onCaptureData(pcm);
    },
  );
  const volumeSubscription = native.addExpoTwoWayAudioEventListener(
    "onInputVolumeLevelData",
    (event: { data: number }) => {
      if (!refs.captureActive) {
        return;
      }
      const level = refs.muted ? 0 : event.data;
      callbacks.onVolumeLevel(level);
    },
  );
  const interruptionSubscription = native.addExpoTwoWayAudioEventListener(
    "onAudioInterruption",
    (event: { data: string }) => {
      if (event.data === "capture_paused" || event.data === "capture_resumed") {
        if (refs.captureActive) {
          callbacks.onCaptureAvailabilityChange?.(event.data === "capture_resumed");
        }
        return;
      }
      if (event.data !== "blocked") {
        return;
      }
      const wasCaptureActive = refs.captureActive;
      refs.captureActive = false;
      refs.muted = false;
      refs.playbackMuted = false;
      refs.activePlayer = null;
      callbacks.onVolumeLevel(0);
      if (wasCaptureActive) {
        callbacks.onInterruption?.();
      }
    },
  );

  async function ensureInitialized(): Promise<void> {
    if (refs.initialized) {
      return;
    }
    const success = await native.initialize();
    if (!success) {
      throw new Error("expo-two-way-audio: native initialize() returned false");
    }
    refs.initialized = true;
  }

  /**
   * Release the OS audio session as soon as we are neither capturing nor playing.
   * Holding it keeps the user's background music paused — on iOS the non-mixing
   * `.playAndRecord` category survives backgrounding and is re-asserted on every
   * foreground, so an unreleased session means their music never comes back.
   */
  function releaseSessionIfIdle(): void {
    if (!refs.initialized || refs.destroyed) {
      return;
    }
    if (refs.captureActive || playback.isPlaying() || playback.isHeld()) {
      return;
    }
    // The wrapper no-ops on binaries whose native module predates this function.
    native.releaseAudioSession();
  }

  async function ensureMicrophonePermission(): Promise<void> {
    let permission = await native.getMicrophonePermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      permission = await native.requestMicrophonePermissionsAsync().catch(() => null);
    }
    if (!permission?.granted) {
      throw new Error(
        "Microphone permission is required to capture audio. Please enable microphone access in system settings.",
      );
    }
  }

  let nextFileId = 0;
  async function playAudio(audio: AudioPlaybackSource, signal: AbortSignal): Promise<number> {
    // Speak plays on the phone-call route: the duplex engine's
    // USAGE_VOICE_COMMUNICATION + CONTENT_TYPE_SPEECH track runs
    // MODE_IN_COMMUNICATION with SCO routing held for the speak group and
    // released after, so a connected car plays it over any head-unit source
    // (Des's ruling, 28 Oct — the media route was inaudible unless the head
    // unit sat on BT Media). TTS stays 24 kHz; playPcm16 resamples to the
    // voice channel's 16 kHz with interpolation.
    if (audio.type.startsWith("audio/pcm")) {
      const captured = new Uint8Array(await audio.arrayBuffer());
      if (signal.aborted) throw new Error("Playback stopped");
      await ensureInitialized();
      // A chunk of a muted speak group starts on a silent track; unmuting
      // mid-chunk flips the duplex track through setPlaybackMuted.
      if (refs.playbackMuted) native.setPlaybackMuted(true);
      refs.duplexPlaying = true;
      try {
        return await playPcm16(captured, audio.type, signal, native);
      } finally {
        refs.duplexPlaying = false;
      }
    }
    if (signal.aborted) throw new Error("Playback stopped");
    const type = audio.type;
    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (signal.aborted) throw new Error("Playback stopped");
    // Capture owns its audio session while active. File playback alone must not
    // initialize the microphone or the native two-way engine.
    if (!refs.captureActive) {
      await setAudioModeAsync({
        playsInSilentMode: true,
        // Speech keeps playing with the app backgrounded: the manifest already carries
        // the mediaPlayback foreground service, and expo-audio only abandons the session
        // on backgrounding when this is false.
        shouldPlayInBackground: true,
        allowsRecording: false,
        interruptionMode: "duckOthers",
        interruptionModeAndroid: "duckOthers",
      });
    }
    if (signal.aborted) throw new Error("Playback stopped");
    // AVPlayer needs a file extension to recognize local encoded audio on iOS.
    const extension =
      {
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/wave": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/mp4": "m4a",
        "audio/aac": "aac",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
      }[type.split(";")[0].trim()] ?? "audio";
    const file = new File(Paths.cache, `paseo-audio-${Date.now()}-${nextFileId++}.${extension}`);
    try {
      file.write(bytes);
      const player = createAudioPlayer(file.uri, {
        updateInterval: 100,
        keepAudioSessionActive: refs.captureActive,
      });
      // A chunk of a muted speak group starts silent; unmuting mid-chunk
      // flips the active player's volume through setPlaybackMuted.
      player.volume = refs.playbackMuted ? 0 : 1;
      refs.activePlayer = player;
      try {
        return await playFile(player, signal);
      } finally {
        if (refs.activePlayer === player) refs.activePlayer = null;
      }
    } finally {
      if (file.exists) file.delete();
    }
  }
  const playback = createPlaybackQueue(playAudio, releaseSessionIfIdle);

  return {
    async initialize() {
      await ensureInitialized();
    },

    async destroy() {
      if (refs.destroyed) {
        return;
      }
      refs.destroyed = true;
      playback.destroy();
      if (refs.captureActive) {
        native.toggleRecording(false);
        refs.captureActive = false;
      }
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (refs.initialized) {
        native.tearDown();
        refs.initialized = false;
      }
      microphoneSubscription.remove();
      volumeSubscription.remove();
      interruptionSubscription.remove();
    },

    async startCapture() {
      if (refs.captureActive) {
        return;
      }

      try {
        await ensureMicrophonePermission();
        await ensureInitialized();
        const isRecording =
          options?.captureMode === "dictation"
            ? native.startDictation()
            : native.toggleRecording(true);
        if (!isRecording) {
          throw new Error(
            "Microphone capture could not start because Android audio focus is unavailable.",
          );
        }
        refs.captureActive = true;
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        callbacks.onError?.(wrapped);
        throw wrapped;
      }
    },

    async stopCapture() {
      if (refs.captureActive) {
        native.toggleRecording(false);
      }
      refs.captureActive = false;
      refs.muted = false;
      refs.playbackMuted = false;
      refs.activePlayer = null;
      callbacks.onVolumeLevel(0);
      callbacks.onCaptureAvailabilityChange?.(true);
      releaseSessionIfIdle();
    },

    toggleMute() {
      refs.muted = !refs.muted;
      if (refs.muted) {
        callbacks.onVolumeLevel(0);
      }
      return refs.muted;
    },

    isMuted() {
      return refs.muted;
    },

    setPlaybackMuted(muted: boolean) {
      refs.playbackMuted = muted;
      if (refs.duplexPlaying) {
        // The wrapper no-ops on binaries whose native module predates this function.
        native.setPlaybackMuted(muted);
        return;
      }
      const player = refs.activePlayer;
      if (player) player.volume = muted ? 0 : 1;
    },

    play: playback.play,
    stop: playback.stop,
    clearQueue: playback.clearQueue,
    isPlaying: playback.isPlaying,
    beginPlaybackHold: playback.hold,
    endPlaybackHold: playback.releaseHold,
  };
}
