import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function captureSlashBoundary(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const commandLibrary =
      event.systemPrompt.match(/<dci-command-library\b[\s\S]*?<\/dci-command-library>/)?.[0] ??
      null;
    return {
      message: {
        customType: "paseo-slash-proof-boundary",
        content: JSON.stringify({ sourcePrompt: event.prompt, commandLibrary }),
        display: false,
      },
    };
  });
}
