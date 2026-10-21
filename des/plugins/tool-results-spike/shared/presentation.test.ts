import { describe, expect, it } from "vitest";
import { toolRowDataSchema, type ToolRowData } from "./tool-call";
import { buildToolRowPresentation } from "./presentation";

function row(overrides: Partial<ToolRowData> = {}): ToolRowData {
  return toolRowDataSchema.parse({
    callId: "call-1",
    source: {},
    name: "web_search",
    status: "completed",
    label: "Web Search",
    ...overrides,
  });
}

describe("buildToolRowPresentation — meaningful-detail semantics", () => {
  it("treats empty object, array and string output as no details", () => {
    for (const output of [{}, [], "   "]) {
      const p = buildToolRowPresentation(row({ output }));
      expect(p.hasDetails).toBe(false);
    }
  });

  it("treats false and zero scalars as meaningful details", () => {
    for (const output of [false, 0]) {
      const p = buildToolRowPresentation(row({ output }));
      expect(p.hasDetails).toBe(true);
    }
  });

  it("sees nested meaningful values inside objects and arrays", () => {
    const p = buildToolRowPresentation(row({ output: { a: [null, { b: "x" }] } }));
    expect(p.hasDetails).toBe(true);
  });

  it("has no details when input and output are absent", () => {
    const p = buildToolRowPresentation(row({}));
    expect(p.hasDetails).toBe(false);
  });

  it("counts meaningful input alone as details", () => {
    const p = buildToolRowPresentation(row({ input: { q: "homes" } }));
    expect(p.hasDetails).toBe(true);
  });
});

describe("buildToolRowPresentation — status transitions and loading", () => {
  it("loads while running with no error and no meaningful detail", () => {
    const p = buildToolRowPresentation(row({ status: "running" }));
    expect(p.isLoadingDetails).toBe(true);
    expect(p.canOpenDetails).toBe(true);
    expect(p.hasDetails).toBe(false);
  });

  it("stops loading once running output arrives", () => {
    const p = buildToolRowPresentation(row({ status: "running", output: { hits: 3 } }));
    expect(p.isLoadingDetails).toBe(false);
    expect(p.hasDetails).toBe(true);
    expect(p.canOpenDetails).toBe(true);
  });

  it("never loads on terminal statuses", () => {
    for (const status of ["completed", "failed", "canceled"] as const) {
      const p = buildToolRowPresentation(row({ status }));
      expect(p.isLoadingDetails).toBe(false);
    }
  });

  it("stops loading when a running call carries an error", () => {
    const p = buildToolRowPresentation(row({ status: "running", error: "boom" }));
    expect(p.isLoadingDetails).toBe(false);
    expect(p.hasDetails).toBe(true);
  });
});

describe("buildToolRowPresentation — failed error text", () => {
  it("formats failed string errors verbatim", () => {
    const p = buildToolRowPresentation(row({ status: "failed", error: "boom" }));
    expect(p.errorText).toBe("boom");
  });

  it("formats failed errors with string content", () => {
    const p = buildToolRowPresentation(row({ status: "failed", error: { content: "bad" } }));
    expect(p.errorText).toBe("bad");
  });

  it("omits error text when failed with no error value", () => {
    const p = buildToolRowPresentation(row({ status: "failed", error: null }));
    expect(p.errorText).toBeUndefined();
  });

  it("omits error text for non-failed statuses even with an error value", () => {
    const p = buildToolRowPresentation(row({ status: "completed", error: "boom" }));
    expect(p.errorText).toBeUndefined();
    expect(p.hasDetails).toBe(true);
  });
});

describe("buildToolRowPresentation — canceled partial result", () => {
  it("opens a canceled row that has partial output", () => {
    const p = buildToolRowPresentation(row({ status: "canceled", output: { partial: true } }));
    expect(p.hasDetails).toBe(true);
    expect(p.canOpenDetails).toBe(true);
    expect(p.isLoadingDetails).toBe(false);
    expect(p.errorText).toBeUndefined();
  });

  it("does not open a canceled row with empty output", () => {
    const p = buildToolRowPresentation(row({ status: "canceled", output: {} }));
    expect(p.hasDetails).toBe(false);
    expect(p.canOpenDetails).toBe(false);
  });
});

describe("buildToolRowPresentation — canonical display names", () => {
  it("prefers toolDisplayName metadata", () => {
    const p = buildToolRowPresentation(row({ metadata: { toolDisplayName: "Custom Name" } }));
    expect(p.displayName).toBe("Custom Name");
  });

  it("humanizes snake_case names", () => {
    const p = buildToolRowPresentation(row({ name: "my_tool" }));
    expect(p.displayName).toBe("My tool");
  });

  it("keeps names with separators as given", () => {
    const p = buildToolRowPresentation(row({ name: "mcp__server__tool" }));
    expect(p.displayName).toBe("mcp__server__tool");
  });

  it("applies the task and thinking unknown-detail overrides", () => {
    expect(buildToolRowPresentation(row({ name: "task" })).displayName).toBe("Task");
    expect(buildToolRowPresentation(row({ name: "thinking" })).displayName).toBe("Thinking");
  });

  it("surfaces the task subAgentActivity metadata as summary", () => {
    const p = buildToolRowPresentation(
      row({ name: "task", metadata: { subAgentActivity: "exploring" } }),
    );
    expect(p.summary).toBe("exploring");
  });

  it("matches the stored label computed at transform time", () => {
    const data = row({ name: "my_tool", label: "My tool" });
    expect(buildToolRowPresentation(data).displayName).toBe(data.label);
  });
});

describe("buildToolRowPresentation — icon name and status", () => {
  it("defaults unknown tools to the wrench icon name", () => {
    const p = buildToolRowPresentation(row({ name: "web_search" }));
    expect(p.iconName).toBe("Wrench");
  });

  it("applies the original name-based icon overrides", () => {
    expect(buildToolRowPresentation(row({ name: "thinking" })).iconName).toBe("Brain");
    expect(buildToolRowPresentation(row({ name: "task" })).iconName).toBe("Bot");
    expect(buildToolRowPresentation(row({ name: "speak" })).iconName).toBe("MicVocal");
  });

  it("carries the row status through unchanged", () => {
    const p = buildToolRowPresentation(row({ status: "canceled" }));
    expect(p.status).toBe("canceled");
  });
});
