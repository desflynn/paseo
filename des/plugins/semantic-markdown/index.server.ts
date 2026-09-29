import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readImage } from "./server/read-image.ts";
import { readImageRpc } from "./shared/read-image.ts";

export default function contribute(server: PluginServerContext) {
  server.handle(readImageRpc, readImage);
  return () => {};
}
