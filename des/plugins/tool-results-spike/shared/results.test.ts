import { describe, expect, test } from "vitest";
import { inspectResult, keyedItems, nativeUnknownSections, unwrapResult } from "./results";

describe("tool result inspection", () => {
  test("keeps duplicate rows while retaining keys when unrelated rows are inserted", () => {
    const original = keyedItems([{ name: "A" }, { name: "A" }]);
    expect(original[0].key).not.toBe(original[1].key);
    expect(keyedItems([{ name: "B" }, { name: "A" }, { name: "A" }]).slice(1)).toEqual(original);
  });
  test("preserves native unknown-detail section selection", () => {
    expect(nativeUnknownSections("plain input", null)).toEqual([
      { title: "", value: "plain input" },
    ]);
    expect(nativeUnknownSections({}, [])).toEqual([]);
    expect(nativeUnknownSections({ query: "x" }, false)).toEqual([
      { title: "Input", value: { query: "x" } },
      { title: "Output", value: false },
    ]);
    expect(nativeUnknownSections(null, 0)).toEqual([{ title: "Output", value: 0 }]);
  });
  test("prefers structured MCP content without changing the original", () => {
    const result = {
      structuredContent: { ok: true },
      content: [{ type: "text", text: "summary" }],
    };
    expect(unwrapResult(result)).toEqual({ ok: true });
    expect(result.content[0].text).toBe("summary");
  });
  test("decodes JSON text, but keeps ordinary text and multipart content", () => {
    expect(unwrapResult({ content: [{ type: "text", text: '[{"name":"Des"}]' }] })).toEqual([
      { name: "Des" },
    ]);
    expect(unwrapResult({ content: [{ type: "text", text: "hello" }] })).toBe("hello");
    const parts = {
      content: [
        { type: "text", text: "first" },
        { type: "image", data: "original" },
      ],
    };
    expect(unwrapResult(parts)).toBe(parts);
  });
  test("finds a full JSON body after summary prose and keeps the prose", () => {
    const agents = [
      {
        id: "a1",
        shortId: "a1",
        title: "Root",
        provider: "pi",
        model: "glm",
        thinkingOptionId: null,
        status: "idle",
        labels: {},
      },
      {
        id: "a2",
        shortId: "a2",
        title: "Worker",
        provider: "codex",
        model: "gpt",
        thinkingOptionId: "high",
        status: "idle",
        labels: { lane: "ui" },
        parent: { id: "a1" },
      },
    ];
    const text = `agents_count=10\nagents_ids=a1,a2\n\n${JSON.stringify({ agents })}`;
    const output = { content: [{ type: "text", text }] };
    const view = inspectResult(unwrapResult(output));
    expect(view).toMatchObject({
      kind: "annotated",
      prose: "agents_count=10\nagents_ids=a1,a2",
    });
    if (view.kind !== "annotated") throw new Error("expected annotated");
    expect(view.view).toMatchObject({ kind: "record", fields: [["agents", agents]] });
    const rows = inspectResult(agents);
    expect(rows).toMatchObject({
      kind: "table",
      columns: [
        "id",
        "shortId",
        "title",
        "provider",
        "model",
        "thinkingOptionId",
        "status",
        "labels",
        "parent",
      ],
    });
    if (rows.kind !== "table") throw new Error("expected table");
    expect(rows.rows).toEqual(agents);
    expect(output).toEqual({ content: [{ type: "text", text }] });
  });
  test("keeps trailing error prose after a complete JSON body", () => {
    const text = '{"agents":[]}\nError: rate limited';
    const view = inspectResult(unwrapResult({ content: [{ type: "text", text }] }));
    expect(view).toMatchObject({ kind: "annotated", prose: "Error: rate limited" });
    if (view.kind !== "annotated") throw new Error("expected annotated");
    expect(view.view).toEqual({ kind: "record", fields: [["agents", []]] });
  });
  test("keeps ordinary prose with brace characters as text", () => {
    const text = "ratio {not json} summary";
    expect(unwrapResult({ content: [{ type: "text", text }] })).toBe(text);
  });
  test("unwraps an envelope nested inside structuredContent", () => {
    expect(
      unwrapResult({ structuredContent: { content: [{ type: "text", text: "[1,2]" }] } }),
    ).toEqual([1, 2]);
  });
  test("prefers a full JSON part over hook-reminder prose parts", () => {
    const output = {
      content: [
        { type: "text", text: "Updated todos." },
        { type: "text", text: '{"ok":true}' },
        { type: "text", text: "system-reminder: hook fired" },
      ],
    };
    expect(unwrapResult(output)).toEqual({ ok: true });
    expect(output.content[1].text).toBe('{"ok":true}');
  });
  test("exposes task arrays from details instead of the envelope tower", () => {
    const tasks = [
      { id: 237, subject: "A", status: "completed", activeForm: "Doing" },
      { id: 238, subject: "B", status: "pending" },
    ];
    const output = {
      content: [
        { type: "text", text: "Updated todos: 5 visible, 3 deleted." },
        { type: "text", text: "hook reminder" },
      ],
      details: { source: "todo_write", action: "replace", version: 1, tasks },
    };
    const view = inspectResult(unwrapResult(output));
    expect(view).toMatchObject({
      kind: "table",
      columns: ["id", "subject", "status", "activeForm"],
    });
    if (view.kind !== "table") throw new Error("expected table");
    expect(view.rows).toEqual(tasks);
  });
  test("selects a table for record rows even with rich or nullable cells", () => {
    expect(
      inspectResult([
        { name: "A", active: true },
        { active: false, name: "B" },
      ]),
    ).toMatchObject({ kind: "table", columns: ["name", "active"] });
    expect(inspectResult([{ name: "A" }, { title: "B" }])).toMatchObject({ kind: "list" });
    expect(inspectResult([{ name: "A", nested: { id: 1 } }])).toMatchObject({
      kind: "table",
      columns: ["name", "nested"],
    });
  });
  test("recognizes a record list inside a result envelope without dropping sibling metadata", () => {
    const source = { agents: [{ name: "A" }], count: 1 };
    expect(inspectResult(source)).toMatchObject({
      kind: "record",
      fields: [
        ["agents", [{ name: "A" }]],
        ["count", 1],
      ],
    });
  });
  test.each([
    [null, "scalar"],
    [false, "scalar"],
    [0, "scalar"],
    ["", "text"],
    [[], "list"],
    [{}, "record"],
  ])("keeps meaningful empty and scalar values %j", (value, kind) => {
    expect(inspectResult(value).kind).toBe(kind);
  });
});
