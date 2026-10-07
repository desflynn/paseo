import { describe, expect, test } from "vitest";
import type { ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";
import {
  applyGroupingAction,
  buildGroupIndex,
  buildToolCallGroup,
  effectiveHostCallId,
  initialGroupingState,
  isClaimedToolCall,
  type GroupingHistoryPage,
  type GroupingState,
  type GroupingStreamEvent,
  type ToolCallGroup,
} from "./grouping";

function call(callId: string, overrides: Partial<ToolCallTimelineItem> = {}): ToolCallTimelineItem {
  // Fixture builder over the public type; the merge cast only widens fields
  // already present on ToolCallTimelineItem members.
  const base = {
    type: "tool_call",
    callId,
    name: "mcp__tools__run",
    status: "completed",
    error: null,
    detail: { type: "unknown", input: { q: callId }, output: null },
  } as ToolCallTimelineItem;
  return { ...base, ...overrides } as ToolCallTimelineItem;
}

function userMessage(seq: number) {
  return { type: "user_message" as const, text: `msg-${seq}` };
}

function page(entries: GroupingHistoryPage["entries"], extra: Partial<GroupingHistoryPage> = {}) {
  return {
    epoch: "e1",
    reset: false,
    hasOlder: false,
    startCursor: null,
    entries,
    ...extra,
  };
}

function stream(
  item: Parameters<typeof isClaimedToolCall>[0],
  extra: Partial<GroupingStreamEvent> = {},
) {
  return { type: "timeline", item, ...extra } as GroupingStreamEvent;
}

describe("isClaimedToolCall", () => {
  test("claims unknown-detail tool calls only", () => {
    expect(isClaimedToolCall(call("a"))).toBe(true);
    expect(
      isClaimedToolCall({
        type: "tool_call",
        callId: "b",
        name: "bash",
        status: "completed",
        error: null,
        detail: { type: "shell", command: "ls" },
      }),
    ).toBe(false);
    expect(isClaimedToolCall(userMessage(1))).toBe(false);
  });
});

describe("buildToolCallGroup summary (mirrors overview/model.ts)", () => {
  test("counts by detail type and name detection", () => {
    const items: ToolCallTimelineItem[] = [
      call("1", { name: "paseo_spawn_agent" }),
      call("2", { name: "mcp__x__web_search" }),
      call("3", { name: "grep", detail: { type: "search", query: "q" } as never }),
      call("4", { name: "edit_file", detail: { type: "edit", filePath: "/a" } as never }),
      call("5", { name: "edit_file2", detail: { type: "edit", filePath: "/a" } as never }),
      call("6", { name: "read_file", detail: { type: "read", filePath: "/b" } as never }),
      call("7", { name: "bash", detail: { type: "shell", command: "ls" } as never }),
      call("8"),
    ];
    const g = buildToolCallGroup("1", items);
    expect(g.summary).toEqual({
      editedFileCount: 1,
      searchCount: 2,
      readFileCount: 1,
      commandCount: 1,
      otherToolCount: 1,
      paseoCallCount: 1,
    });
  });

  test("running/failed/canceled rollup", () => {
    const items: ToolCallTimelineItem[] = [
      call("1", { status: "running" as const, error: null }),
      call("2", { status: "failed" as const, error: "boom" }),
      call("3", { status: "canceled" as const, error: null }),
      call("4"),
    ];
    const g = buildToolCallGroup("1", items);
    expect(g.isLoading).toBe(true);
    expect(g.failedCount).toBe(1);
    expect(g.canceledCount).toBe(1);
  });

  test("group shape: id/hostCallId alias and canonical calls", () => {
    const items = [call("1"), call("2")];
    const g = buildToolCallGroup("1", items);
    expect(g.id).toBe("1");
    expect(g.hostCallId).toBe("1");
    expect(g.calls).toEqual(items);
  });
});

describe("grouping index", () => {
  test("groups consecutive claimed calls; specialized and non-tool rows split", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a"), seqStart: 1 },
        { item: call("b"), seqStart: 2 },
        {
          item: {
            type: "tool_call",
            callId: "c",
            name: "bash",
            status: "completed",
            error: null,
            detail: { type: "shell", command: "ls" },
          },
          seqStart: 3,
        },
        { item: call("d"), seqStart: 4 },
        { item: userMessage(5), seqStart: 5 },
        { item: call("e"), seqStart: 6 },
      ]),
    });
    const index = buildGroupIndex(state);
    expect(index.groupsByCallId.size).toBe(4); // keys: a,b,d,e — three groups
    const g1 = index.groupsByCallId.get("a")!;
    expect(g1.id).toBe("a");
    expect(g1.calls.map((c) => c.callId)).toEqual(["a", "b"]);
    expect(index.groupsByCallId.get("b")).toBe(g1);
    const g2 = index.groupsByCallId.get("d")!;
    expect(g2.calls.map((c) => c.callId)).toEqual(["d"]);
    const g3 = index.groupsByCallId.get("e")!;
    expect(g3.calls.map((c) => c.callId)).toEqual(["e"]);
    expect(g2).not.toBe(g1);
    expect(g3).not.toBe(g1);
  });

  test("turnId change splits a run", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a"), turnId: "t1", seqStart: 1 },
        { item: call("b"), turnId: "t1", seqStart: 2 },
        { item: call("c"), turnId: "t2", seqStart: 3 },
      ]),
    });
    const index = buildGroupIndex(state);
    expect(index.groupsByCallId.get("a")!.calls.map((c) => c.callId)).toEqual(["a", "b"]);
    expect(index.groupsByCallId.get("c")!.calls.map((c) => c.callId)).toEqual(["c"]);
  });
});

describe("lifecycle merge", () => {
  function stateWithRun(): GroupingState {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a", { status: "running" as const, error: null }), seqStart: 10 },
        { item: userMessage(11), seqStart: 11 },
        { item: call("z"), seqStart: 12 },
      ]),
    });
    return state;
  }

  test("updates same callId in place; keeps first anchor, position, and turnId", () => {
    const state = applyGroupingAction(stateWithRun(), {
      type: "stream",
      event: stream(call("a", { status: "completed" as const, error: null, output: "done" }), {
        seq: 20,
        turnId: "t9",
      }),
    });
    expect(state.entries).toHaveLength(3);
    const a = state.entries[0];
    expect(a.kind).toBe("call");
    if (a.kind !== "call") return;
    expect(a.callId).toBe("a");
    expect(a.anchorSeq).toBe(10);
    expect(a.turnId).toBeUndefined(); // first turnId kept
    expect(a.item.status).toBe("completed");
    const index = buildGroupIndex(state);
    expect(index.groupsByCallId.get("a")!.calls).toHaveLength(1);
    // still one run; the update did not jump the user_message separator
    expect(index.groupsByCallId.get("z")!.id).toBe("z");
  });

  test("older snapshots do not clobber newer live items", () => {
    const updated = applyGroupingAction(stateWithRun(), {
      type: "stream",
      event: stream(call("a", { status: "failed" as const, error: "x" }), { seq: 30 }),
    });
    const stale = applyGroupingAction(updated, {
      type: "stream",
      event: stream(call("a", { status: "running" as const, error: null }), { seq: 12 }),
    });
    const a = stale.entries[0];
    if (a.kind !== "call") return;
    expect(a.item.status).toBe("failed");
    expect(a.lastSeq).toBe(30);
  });

  test("live event without seq appends after existing entries", () => {
    const state = applyGroupingAction(stateWithRun(), {
      type: "stream",
      event: stream(call("q", { status: "running" as const, error: null })),
    });
    const last = state.entries.at(-1);
    expect(last?.kind).toBe("call");
    if (last?.kind !== "call") return;
    expect(last.callId).toBe("q");
    expect(last.seq).toBeGreaterThanOrEqual(13);
  });
});

describe("history merge", () => {
  test("before-page prepends without reordering existing entries; dedupes callIds", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("b"), seqStart: 20 },
        { item: userMessage(21), seqStart: 21 },
        { item: call("c"), seqStart: 22 },
      ]),
    });
    state = applyGroupingAction(state, {
      type: "history",
      page: page(
        [
          { item: call("x"), seqStart: 1 },
          { item: call("b", { status: "failed" as const, error: "old snapshot" }), seqStart: 2 },
          { item: call("a"), seqStart: 3 },
        ],
        { hasOlder: true, startCursor: { seq: 1 } },
      ),
    });
    const order = state.entries.map((e) => (e.kind === "call" ? e.callId : "|"));
    expect(order).toEqual(["x", "a", "b", "|", "c"]);
    // existing b item untouched (older duplicate dropped, first anchor kept)
    const b = state.entries[2];
    if (b.kind !== "call") return;
    expect(b.item.status).toBe("completed");
    expect(b.anchorSeq).toBe(20);
    expect(state.hasOlder).toBe(true);
    expect(state.minSeq).toBe(1);
  });

  test("reset page replaces all entries", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 1 }]),
    });
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("n"), seqStart: 50 }], { reset: true, epoch: "e2" }),
    });
    expect(state.entries.map((e) => (e.kind === "call" ? e.callId : "|"))).toEqual(["n"]);
    expect(state.epoch).toBe("e2");
  });

  test("first page marks status ready and stores epoch/hasOlder/minSeq", () => {
    let state = initialGroupingState();
    expect(state.status).toBe("loading");
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 7 }], { hasOlder: true, epoch: "e9" }),
    });
    expect(state.status).toBe("ready");
    expect(state.epoch).toBe("e9");
    expect(state.hasOlder).toBe(true);
    expect(state.minSeq).toBe(7);
  });
});

describe("epoch / restore / error actions", () => {
  test("replacement clears entries and returns to loading", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 1 }]),
    });
    state = applyGroupingAction(state, { type: "replacement" });
    expect(state.status).toBe("loading");
    expect(state.entries).toHaveLength(0);
    expect(state.epoch).toBeNull();
  });

  test("restored keeps entries and raises needsReset", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 1 }]),
    });
    state = applyGroupingAction(state, { type: "restored" });
    expect(state.needsReset).toBe(true);
    expect(state.entries).toHaveLength(1);
    expect(state.status).toBe("ready");
  });

  test("stream and fetch errors set error status", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, { type: "streamError" });
    expect(state.status).toBe("error");
    state = applyGroupingAction(initialGroupingState(), { type: "fetchError" });
    expect(state.status).toBe("error");
  });

  test("gap page replaces entries", () => {
    let state: GroupingState = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 1 }]),
    });
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("g"), seqStart: 90 }], {
        gap: true,
      } as Partial<GroupingHistoryPage>),
    });
    expect(state.entries.map((e) => (e.kind === "call" ? e.callId : "|"))).toEqual(["g"]);
  });
});

describe("native boundaries (regressions from original grouping.ts)", () => {
  test("speak tool calls are never groupable, even with unknown detail", () => {
    const speak = {
      type: "tool_call" as const,
      callId: "s1",
      name: "speak",
      status: "completed" as const,
      error: null,
      detail: { type: "unknown" as const, input: null, output: null },
    };
    expect(isClaimedToolCall(speak)).toBe(false);
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a"), seqStart: 1 },
        { item: speak, seqStart: 2 },
        { item: call("b"), seqStart: 3 },
      ]),
    });
    const index = buildGroupIndex(state);
    expect(index.groupsByCallId.get("a")!.calls.map((c) => c.callId)).toEqual(["a"]);
    expect(index.groupsByCallId.get("b")!.calls.map((c) => c.callId)).toEqual(["b"]);
    expect(index.groupsByCallId.has("s1")).toBe(false);
  });

  test("plan-detail tool calls are never groupable", () => {
    expect(
      isClaimedToolCall({
        type: "tool_call",
        callId: "p1",
        name: "plan",
        status: "completed",
        error: null,
        detail: { type: "plan", text: "do things" },
      }),
    ).toBe(false);
  });

  test("repeated streamed assistant updates keep first boundary anchor", () => {
    const assistant = (text: string) => ({
      type: "assistant_message" as const,
      text,
      messageId: "m1",
    });
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a"), seqStart: 10 },
        { item: assistant("part 1"), seqStart: 11 },
        { item: call("b"), seqStart: 12 },
      ]),
    });
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream(assistant("part 2"), { seq: 30 }),
    });
    const kinds = state.entries.map((e) => (e.kind === "call" ? e.callId : "|"));
    expect(kinds).toEqual(["a", "|", "b"]); // no later separator after the interleaved call
    const index = buildGroupIndex(state);
    expect(index.groupsByCallId.get("a")!.id).toBe("a");
    expect(index.groupsByCallId.get("b")!.id).toBe("b");
  });

  test("repeated reasoning updates collapse to the first boundary anchor", () => {
    const reasoning = (text: string) => ({ type: "reasoning" as const, text });
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a"), seqStart: 10 },
        { item: reasoning("thinking"), seqStart: 11 },
        { item: call("b"), seqStart: 12 },
      ]),
    });
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream(reasoning("more"), { seq: 30 }),
    });
    expect(state.entries.map((e) => (e.kind === "call" ? e.callId : "|"))).toEqual(["a", "|", "b"]);
  });

  test("redundant consecutive non-tool boundaries collapse; distinct identities stay", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 1 }]),
    });
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream({ type: "assistant_message", text: "x1" }, { seq: 2 }),
    });
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream({ type: "assistant_message", text: "x2" }, { seq: 3 }),
    });
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream(userMessage(4), { seq: 4 }),
    });
    expect(state.entries).toHaveLength(2); // call + one collapsed boundary
    // distinct identified messages stay as separate anchors
    let wide = initialGroupingState();
    wide = applyGroupingAction(wide, {
      type: "stream",
      event: stream({ type: "assistant_message", text: "1", messageId: "m1" }, { seq: 1 }),
    });
    wide = applyGroupingAction(wide, {
      type: "stream",
      event: stream({ type: "assistant_message", text: "2", messageId: "m2" }, { seq: 2 }),
    });
    expect(wide.entries.filter((e) => e.kind === "boundary")).toHaveLength(2);
  });

  test("specialized tool_call updates keep their boundary anchor", () => {
    const shell = (status: "running" | "completed") => ({
      type: "tool_call" as const,
      callId: "sh1",
      name: "bash",
      status,
      error: null,
      detail: { type: "shell" as const, command: "ls" },
    });
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: call("a"), seqStart: 1 },
        { item: shell("running"), seqStart: 2 },
      ]),
    });
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream(shell("completed"), { seq: 9 }),
    });
    expect(state.entries.filter((e) => e.kind === "boundary")).toHaveLength(1);
    expect(state.entries[0]!.kind).toBe("call");
  });
});

describe("history freshness (seqEnd)", () => {
  test("call entries take lastSeq from seqEnd, anchor from seqStart", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 10, seqEnd: 15 }]),
    });
    const a = state.entries[0];
    if (a?.kind !== "call") return;
    expect(a.lastSeq).toBe(15);
    expect(a.anchorSeq).toBe(10);
  });

  test("stale history duplicate does not clobber a fresher live item", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream(call("a", { status: "failed" as const, error: "live" }), { seq: 30 }),
    });
    state = applyGroupingAction(state, {
      type: "history",
      page: page([{ item: call("a"), seqStart: 10, seqEnd: 25 }]),
    });
    const a = state.entries[0];
    if (a?.kind !== "call") return;
    expect(a.item.status).toBe("failed");
    expect(a.lastSeq).toBe(30);
    expect(a.anchorSeq).toBe(30);
  });

  test("fresh history duplicate updates the item in place, keeping the anchor", () => {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "stream",
      event: stream(call("a", { status: "running" as const, error: null }), { seq: 30 }),
    });
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        {
          item: call("a", { status: "completed" as const, error: null, output: "done" }),
          seqStart: 35,
          seqEnd: 40,
        },
      ]),
    });
    const a = state.entries[0];
    if (a?.kind !== "call") return;
    expect(a.item.status).toBe("completed");
    expect(a.lastSeq).toBe(40);
    expect(a.anchorSeq).toBe(30);
    expect(state.entries).toHaveLength(1);
  });
});

describe("effective host selection", () => {
  function groupOf(ids: string[]): ToolCallGroup {
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page(ids.map((id, i) => ({ item: call(id), seqStart: i + 1 }))),
    });
    return buildGroupIndex(state).groupsByCallId.get(ids[0]!)!;
  }

  test("logical first member mounted -> it hosts", () => {
    const g = groupOf(["a", "b", "c"]);
    expect(effectiveHostCallId(g, new Set(["a", "c"]))).toBe("a");
  });

  test("logical first member not mounted -> earliest mounted member hosts", () => {
    const g = groupOf(["a", "b", "c"]);
    expect(effectiveHostCallId(g, new Set(["b", "c"]))).toBe("b");
  });

  test("none mounted -> logical group.id", () => {
    const g = groupOf(["a", "b"]);
    expect(effectiveHostCallId(g, new Set())).toBe("a");
  });
});

describe("groups never drop source data", () => {
  test("group.calls carry the full canonical items", () => {
    const items = [call("1", { output: { big: "blob" } }), call("2", { error: "e" })];
    let state = initialGroupingState();
    state = applyGroupingAction(state, {
      type: "history",
      page: page([
        { item: items[0]!, seqStart: 1 },
        { item: items[1]!, seqStart: 2 },
      ]),
    });
    const g: ToolCallGroup = buildGroupIndex(state).groupsByCallId.get("1")!;
    expect(g.calls[0]).toEqual(items[0]);
    expect(g.calls[1]!.error).toBe("e");
  });
});
