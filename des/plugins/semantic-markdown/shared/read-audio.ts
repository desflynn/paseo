// Local markdown audio links. Same daemon-side read path as images
// (server/read-file.ts), but the client plays the bytes instead of drawing
// them: desktop an HTMLAudioElement on a blob: URL, phone the mermaid
// preview's WebView with an inline <audio controls> on a data: URI.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

/** MIME type for a supported audio path, or null. */
export function audioMimeFromPath(path: string): string | null {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1];
  return extension ? (MIME_BY_EXTENSION[extension.toLowerCase()] ?? null) : null;
}

export const readAudioRpc = defineRpc({
  name: "read-audio",
  input: z.object({ path: z.string() }),
  output: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), mime: z.string(), base64: z.string() }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
});

export type ReadAudioResult = z.infer<typeof readAudioRpc.output>;
