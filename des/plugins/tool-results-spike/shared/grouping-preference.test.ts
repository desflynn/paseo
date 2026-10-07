import { describe, expect, test } from "vitest";
import {
  DEFAULT_TOOL_CALL_DETAIL_LEVEL,
  prefersToolCallGrouping,
  resolveToolCallDetailLevel,
} from "./grouping-preference";

describe("resolveToolCallDetailLevel", () => {
  test("detailed maps to detailed (one-by-one)", () => {
    expect(resolveToolCallDetailLevel({ toolCallDetailLevel: "detailed" })).toBe("detailed");
  });

  test("overview maps to overview (grouped)", () => {
    expect(resolveToolCallDetailLevel({ toolCallDetailLevel: "overview" })).toBe("overview");
  });

  test("legacy concise literal maps to overview like the app zod transform", () => {
    expect(resolveToolCallDetailLevel({ toolCallDetailLevel: "concise" })).toBe("overview");
  });

  test("absent level migrates legacy compactToolCalls=true to overview", () => {
    expect(resolveToolCallDetailLevel({ compactToolCalls: true })).toBe("overview");
  });

  test("absent level migrates legacy compactToolCalls=false to detailed", () => {
    expect(resolveToolCallDetailLevel({ compactToolCalls: false })).toBe("detailed");
  });

  test("absent level with no legacy field defaults to detailed", () => {
    expect(resolveToolCallDetailLevel({})).toBe("detailed");
  });

  test("invalid level catches to detailed and does not consult legacy", () => {
    expect(
      resolveToolCallDetailLevel({ toolCallDetailLevel: "grouped", compactToolCalls: true }),
    ).toBe("detailed");
    expect(resolveToolCallDetailLevel({ toolCallDetailLevel: 42, compactToolCalls: true })).toBe(
      "detailed",
    );
  });

  test("malformed blobs default to detailed", () => {
    expect(resolveToolCallDetailLevel(null)).toBe("detailed");
    expect(resolveToolCallDetailLevel(undefined)).toBe("detailed");
    expect(resolveToolCallDetailLevel("overview")).toBe("detailed");
    expect(resolveToolCallDetailLevel([])).toBe("detailed");
    expect(resolveToolCallDetailLevel(7)).toBe("detailed");
  });

  test("default constant is detailed (safe: one-by-one)", () => {
    expect(DEFAULT_TOOL_CALL_DETAIL_LEVEL).toBe("detailed");
  });
});

describe("prefersToolCallGrouping", () => {
  test("true only for overview", () => {
    expect(prefersToolCallGrouping({ toolCallDetailLevel: "overview" })).toBe(true);
    expect(prefersToolCallGrouping({ toolCallDetailLevel: "detailed" })).toBe(false);
    expect(prefersToolCallGrouping({})).toBe(false);
    expect(prefersToolCallGrouping(undefined)).toBe(false);
  });

  test("owner's persisted setting stays one-by-one", () => {
    const blob = {
      toolCallDetailLevel: "detailed",
      compactToolCalls: true,
    };
    expect(prefersToolCallGrouping(blob)).toBe(false);
  });
});
