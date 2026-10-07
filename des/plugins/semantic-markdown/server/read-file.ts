// Shared body of the plugin's read-<thing>-as-base64 RPCs (read-image, read-audio):
// resolve the local path, allowlist the extension, cap the size, read, encode.
// Node-only — server process; never imported by the client bundle.
import { readFile, stat } from "node:fs/promises";
import { localFilePath } from "../shared/file-link.ts";

export type LocalBase64Result =
  | { ok: true; mime: string; base64: string }
  | { ok: false; error: string };

export async function readLocalBase64(input: {
  rawPath: string;
  mimeFromPath(path: string): string | null;
  maxBytes: number;
  /** Error strings, word for word as the RPC has always returned them. */
  errors: { badPath: string; unsupported: string; tooLarge: string };
}): Promise<LocalBase64Result> {
  const path = localFilePath(input.rawPath.trim());
  if (!path) return { ok: false, error: input.errors.badPath };
  const mime = input.mimeFromPath(path);
  if (!mime) return { ok: false, error: input.errors.unsupported };
  try {
    const { size } = await stat(path);
    if (size > input.maxBytes) return { ok: false, error: input.errors.tooLarge };
    const bytes = await readFile(path);
    return { ok: true, mime, base64: bytes.toString("base64") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
