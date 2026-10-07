import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readAudio } from "./server/read-audio.ts";
import { readImage } from "./server/read-image.ts";
import { readAudioRpc } from "./shared/read-audio.ts";
import { readImageRpc } from "./shared/read-image.ts";

export default function contribute(server: PluginServerContext) {
  server.handle(readImageRpc, readImage);
  server.handle(readAudioRpc, readAudio);
  return () => {};
}
