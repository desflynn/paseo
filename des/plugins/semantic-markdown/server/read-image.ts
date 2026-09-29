import { readFile, stat } from "node:fs/promises";
import type { RpcInput } from "@getpaseo/plugin";
import { localFilePath } from "../shared/file-link.ts";
import { MAX_IMAGE_BYTES, imageMimeFromPath, readImageRpc } from "../shared/read-image.ts";

export async function readImage(input: RpcInput<typeof readImageRpc>) {
  const path = localFilePath(input.path.trim());
  if (!path) {
    return { ok: false as const, error: "not an absolute path" };
  }
  const mime = imageMimeFromPath(path);
  if (!mime) {
    return { ok: false as const, error: "unsupported image type" };
  }
  try {
    const { size } = await stat(path);
    if (size > MAX_IMAGE_BYTES) {
      return { ok: false as const, error: "image too large" };
    }
    const bytes = await readFile(path);
    return { ok: true as const, mime, base64: bytes.toString("base64") };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}
