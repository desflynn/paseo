import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RpcInput } from "@getpaseo/plugin";
import { localFilePath } from "../shared/file-link.ts";
import { audioMimeFromPath, type audioDurationRpc } from "../shared/read-audio.ts";

const run = promisify(execFile);

export function parseAfinfoDuration(output: string): number | null {
  const match = /estimated duration:\s*([\d.]+)\s*sec/.exec(output);
  return match ? Number(match[1]) : null;
}

// ponytail: macOS afinfo (CoreAudio, every format we allow, no dependency). A
// daemon without it (Linux) shows no duration; add a JS frame parser if that matters.
export async function audioDuration(
  input: RpcInput<typeof audioDurationRpc>,
): Promise<{ seconds: number | null }> {
  const path = localFilePath(input.path.trim());
  if (!path || !audioMimeFromPath(path)) return { seconds: null };
  try {
    const { stdout } = await run("afinfo", [path], { timeout: 5000 });
    return { seconds: parseAfinfoDuration(stdout) };
  } catch {
    return { seconds: null };
  }
}
