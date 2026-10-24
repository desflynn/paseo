import { z } from "zod";
import type { PiExtension } from "../contract.js";

const Args = z
  .object({
    tool: z.string().optional().catch(undefined),
    server: z.string().optional().catch(undefined),
    action: z.string().optional().catch(undefined),
    connect: z.string().optional().catch(undefined),
    describe: z.string().optional().catch(undefined),
    search: z.string().optional().catch(undefined),
  })
  .passthrough();
const Details = z
  .object({
    mode: z.string().optional().catch(undefined),
    server: z.string().optional().catch(undefined),
    tool: z.string().optional().catch(undefined),
  })
  .passthrough();
const nonEmpty = (value: string | undefined) => value?.trim() || undefined;

function identifyTool(tool: string, server?: string) {
  if (server) {
    return {
      server,
      tool: tool.startsWith(`${server}_`) ? tool.slice(server.length + 1) : tool,
    };
  }
  const separator = tool.indexOf("_");
  return separator > 0
    ? { server: tool.slice(0, separator), tool: tool.slice(separator + 1) }
    : { server: undefined, tool };
}

function completedTool(server?: string, tool?: string, mode?: string) {
  if (!server || !tool || (mode && mode !== "call")) return undefined;
  return identifyTool(tool, server);
}

function label(server: string | undefined, action: string) {
  const serverName = server ?? "Gateway";
  const actionName = action === "list_agents" ? "get_agents" : action;
  return {
    displayName: `${serverName[0].toUpperCase()}${serverName.slice(1)} > ${actionName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[._\s-]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")}`,
  };
}

function toolLabel(resolved: ReturnType<typeof identifyTool>) {
  return {
    ...label(resolved.server, resolved.tool),
    ...(resolved.server ? { name: `${resolved.server}.${resolved.tool}` } : {}),
  };
}

export const piMcpAdapter: PiExtension = {
  id: "pi-mcp-adapter",
  createSession: () => ({
    mapToolCall(call) {
      if (call.toolName !== "mcp") return undefined;
      const details = Details.safeParse(
        call.result && typeof call.result !== "string" ? call.result.details : undefined,
      );
      const resultServer = details.success ? nonEmpty(details.data.server) : undefined;
      const resultTool = details.success ? nonEmpty(details.data.tool) : undefined;
      const resultMode = details.success ? nonEmpty(details.data.mode) : undefined;
      const completedCall = completedTool(resultServer, resultTool, resultMode);
      const args = Args.safeParse(call.args);
      if (!args.success) {
        return completedCall ? toolLabel(completedCall) : undefined;
      }

      const server = nonEmpty(args.data.server) ?? resultServer;
      // Match gateway dispatch precedence; describe metadata also contains a tool name.
      const action = nonEmpty(args.data.action);
      if (action) return label(server, action);
      const tool = nonEmpty(args.data.tool);
      if (tool) {
        const resolved = completedCall ?? identifyTool(tool, server);
        return toolLabel(resolved);
      }
      const connect = nonEmpty(args.data.connect);
      if (connect) return label(connect, "Connect");
      const describe = nonEmpty(args.data.describe);
      if (describe) return label(server ?? identifyTool(describe).server, "Describe Tool");
      if (nonEmpty(args.data.search)) return label(server, "Search Tools");
      if (nonEmpty(args.data.server)) return label(server, "List Tools");
      if (completedCall) return toolLabel(completedCall);
      return label(undefined, "Status");
    },
  }),
};
