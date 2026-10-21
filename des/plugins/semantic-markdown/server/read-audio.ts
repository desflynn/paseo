import type { RpcInput } from "@getpaseo/plugin";
import { readLocalBase64 } from "./read-file.ts";
import { MAX_AUDIO_BYTES, audioMimeFromPath, readAudioRpc } from "../shared/read-audio.ts";

export async function readAudio(input: RpcInput<typeof readAudioRpc>) {
  return readLocalBase64({
    rawPath: input.path,
    mimeFromPath: audioMimeFromPath,
    maxBytes: MAX_AUDIO_BYTES,
    errors: {
      badPath: "not an absolute path",
      unsupported: "unsupported audio type",
      tooLarge: "audio too large",
    },
  });
}
