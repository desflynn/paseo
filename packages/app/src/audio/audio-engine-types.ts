export interface AudioEngineCallbacks {
  onCaptureData(pcm: Uint8Array): void;
  onVolumeLevel(level: number): void;
  onInterruption?(): void;
  onCaptureAvailabilityChange?(available: boolean): void;
  onError?(error: Error): void;
}

export interface AudioPlaybackSource {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  type: string;
}

export interface AudioEngine {
  initialize(): Promise<void>;
  destroy(): Promise<void>;

  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  toggleMute(): boolean;
  isMuted(): boolean;

  play(audio: AudioPlaybackSource, signal?: AbortSignal): Promise<number>;
  stop(): void;
  clearQueue(): void;
  isPlaying(): boolean;

  /**
   * Mute speech playback without pausing it: the stream keeps playing
   * silently and unmuting hears it wherever it has reached. The volume-key
   * mute lane (src/audio/volume-mute) drives this. Applies to new chunks at
   * once and to the chunk playing when the flag flips.
   */
  setPlaybackMuted(muted: boolean): void;

  /**
   * Keep the OS audio session open while a multi-chunk speak group streams:
   * releasing between chunks drops the Bluetooth route and stalls the next
   * chunk. Holds nest; end one for every begin. No-op where there is no OS
   * session to hold (web).
   */
  beginPlaybackHold(): void;
  endPlaybackHold(): void;
}

export interface AudioEngineOptions {
  traceLabel?: string;
  captureMode?: "conversation" | "dictation";
}
