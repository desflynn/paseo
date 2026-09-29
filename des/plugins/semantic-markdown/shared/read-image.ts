// Local markdown images. The app's image loader reaches http(s) and data: only, so the
// plugin's own daemon process reads the file and the client renders a data: URI.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** MIME type for a supported image path, or null. SVG stays out: RN Image cannot draw it. */
export function imageMimeFromPath(path: string): string | null {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1];
  return extension ? (MIME_BY_EXTENSION[extension.toLowerCase()] ?? null) : null;
}

export const readImageRpc = defineRpc({
  name: "read-image",
  input: z.object({ path: z.string() }),
  output: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), mime: z.string(), base64: z.string() }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
});

export type ReadImageResult = z.infer<typeof readImageRpc.output>;
