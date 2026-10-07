import type { RpcInput } from "@getpaseo/plugin";
import { readLocalBase64 } from "./read-file.ts";
import { MAX_IMAGE_BYTES, imageMimeFromPath, readImageRpc } from "../shared/read-image.ts";

export async function readImage(input: RpcInput<typeof readImageRpc>) {
  return readLocalBase64({
    rawPath: input.path,
    mimeFromPath: imageMimeFromPath,
    maxBytes: MAX_IMAGE_BYTES,
    errors: {
      badPath: "not an absolute path",
      unsupported: "unsupported image type",
      tooLarge: "image too large",
    },
  });
}
