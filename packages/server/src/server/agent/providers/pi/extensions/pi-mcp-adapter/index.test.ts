import { describe, expect, test } from "vitest";
import { createPiExtensionHost } from "../index.js";
import {
  parseToolArgs,
  parseToolResult,
  type PiToolResult,
  type PiTrackedToolCall,
} from "../../tool-call-mapper.js";

function mapping(toolCall: PiTrackedToolCall, result: PiToolResult) {
  return createPiExtensionHost().mapToolCall({
    callId: "test-call",
    toolName: toolCall.toolName,
    args: toolCall.args,
    status: result ? "completed" : "running",
    result,
  });
}
function resolveToolCallName(toolCall: PiTrackedToolCall, result: PiToolResult) {
  return mapping(toolCall, result)?.displayName ?? toolCall.toolName;
}

describe("pi-mcp-adapter adapter", () => {
  test("normalizes Pi MCP proxy calls from requested tool args while running", () => {
    const toolCall = parseToolArgs("mcp", {
      tool: "paseo_list_models",
      args: '{"provider":"pi"}',
    });

    expect(resolveToolCallName(toolCall, null)).toBe("Paseo > List Models");
    expect(mapping(toolCall, null)?.name).toBe("paseo.list_models");
  });

  test("normalizes Pi MCP proxy calls from result details when completed", () => {
    const toolCall = parseToolArgs("mcp", {
      tool: "paseo_list_models",
      args: '{"provider":"pi"}',
    });
    const result = parseToolResult({
      content: [{ type: "text", text: "(empty result)" }],
      details: {
        mode: "call",
        server: "paseo",
        tool: "list_models",
      },
    });

    expect(resolveToolCallName(toolCall, result)).toBe("Paseo > List Models");
    expect(mapping(toolCall, result)?.name).toBe("paseo.list_models");
  });

  test.each([
    [{ server: "paseo", tool: "paseo_list_agents" }, "Paseo > Get Agents"],
    [{ server: "flight-plan", tool: "prefill" }, "Flight-plan > Prefill"],
    [{ tool: "dci_memory_search" }, "Dci > Memory Search"],
    [{ tool: "prefill" }, "Gateway > Prefill"],
    [{ search: "agents" }, "Gateway > Search Tools"],
    [{ search: "agents", server: "paseo" }, "Paseo > Search Tools"],
    [{ describe: "paseo_list_agents" }, "Paseo > Describe Tool"],
    [{ connect: "paseo", server: "dci" }, "Paseo > Connect"],
    [{ server: "paseo" }, "Paseo > List Tools"],
    [{}, "Gateway > Status"],
    [{ action: "auth-start", server: "paseo", tool: "dci_memory_search" }, "Paseo > Auth Start"],
    [{ tool: "paseo_list_agents", connect: "dci" }, "Paseo > Get Agents"],
    [{ describe: "dci_memory_search", search: "agents" }, "Dci > Describe Tool"],
  ])("labels gateway request %j as %s", (args, expected) => {
    expect(resolveToolCallName(parseToolArgs("mcp", args), null)).toBe(expected);
  });

  test("uses completed server metadata without duplicating the tool prefix", () => {
    const result = parseToolResult({
      content: [],
      details: { mode: "call", server: "flight-plan", tool: "flight-plan_prefill" },
    });
    expect(resolveToolCallName(parseToolArgs("mcp", { tool: "prefill" }), result)).toBe(
      "Flight-plan > Prefill",
    );
  });

  test("does not mistake describe metadata for an actual call", () => {
    const result = parseToolResult({
      content: [],
      details: { mode: "describe", server: "paseo", tool: "list_agents" },
    });
    expect(
      resolveToolCallName(parseToolArgs("mcp", { describe: "paseo_list_agents" }), result),
    ).toBe("Paseo > Describe Tool");
  });

  test("leaves malformed args and unrelated tools alone", () => {
    expect(mapping(parseToolArgs("mcp", "invalid"), null)).toBeUndefined();
    expect(mapping(parseToolArgs("read", { path: "README.md" }), null)).toBeUndefined();
    expect(resolveToolCallName(parseToolArgs("mcp", { tool: 123, server: false }), null)).toBe(
      "Gateway > Status",
    );
  });
});
