import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { AgentTimelineItem, ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";

/**
 * Pure grouping engine for claimed unknown-detail tool_call rows, mirroring the
 * host Overview summary (packages/app/src/tool-calls/detail-level/overview).
 * Groups form over CONSECUTIVE claimed calls only: specialized tool calls and
 * non-tool rows are separators. Source items are canonical AgentTimelineItem
 * values and are never dropped or mutated.
 */

const DIRECT_PASEO_TOOL_PREFIX = "paseo_";
const DIRECT_SEARCH_TOOL_SUFFIX_PATTERN = /(?:^|[_.:/])(?:web_search|llm_context)$/;

export interface OverviewSummary {
  editedFileCount: number;
  commandCount: number;
  readFileCount: number;
  searchCount: number;
  otherToolCount: number;
  paseoCallCount: number;
}

export interface ToolCallGroup {
  /** Host callId: the first member of the run. */
  id: string;
  /** Same value as `id`. */
  hostCallId: string;
  /** Canonical source items in timeline order; never dropped. */
  calls: readonly ToolCallTimelineItem[];
  summary: OverviewSummary;
  isLoading: boolean;
  failedCount: number;
  canceledCount: number;
}

export interface GroupingPageEntry {
  item: AgentTimelineItem;
  turnId?: string;
  /** First-seen anchor. */
  seqStart: number;
  /** Freshness; lifecycle comparisons use this, never seqStart. */
  seqEnd?: number;
}

export interface GroupingHistoryPage {
  epoch: string;
  reset: boolean;
  hasOlder: boolean;
  /** Pass-through cursor for direction:"before" refetches. */
  startCursor: unknown;
  gap?: boolean;
  entries: readonly GroupingPageEntry[];
}

export interface GroupingStreamEvent {
  type: "timeline";
  item: AgentTimelineItem;
  turnId?: string;
  seq?: number;
  epoch?: string;
}

export type GroupingEntry =
  | {
      kind: "call";
      callId: string;
      turnId?: string;
      /** Ordering key: frozen at first arrival (first sequence anchor). */
      seq: number;
      /** Same value as `seq`; kept under its own name for clarity. */
      anchorSeq: number;
      /** Newest applied lifecycle seq; drives merge precedence only. */
      lastSeq: number;
      item: ToolCallTimelineItem;
    }
  | { kind: "boundary"; seq: number; turnId?: string; identity?: string };

export interface GroupingState {
  status: "loading" | "ready" | "error";
  epoch: string | null;
  entries: readonly GroupingEntry[];
  hasOlder: boolean;
  minSeq: number | null;
  nextLiveSeq: number;
  /** subscription_restored seen; a reset refetch is pending. */
  needsReset: boolean;
}

export type GroupingAction =
  | { type: "history"; page: GroupingHistoryPage }
  | { type: "stream"; event: GroupingStreamEvent }
  | { type: "replacement" }
  | { type: "restored" }
  | { type: "streamError" }
  | { type: "fetchError" };

export function initialGroupingState(): GroupingState {
  return {
    status: "loading",
    epoch: null,
    entries: [],
    hasOlder: false,
    minSeq: null,
    nextLiveSeq: 1,
    needsReset: false,
  };
}

export function isClaimedToolCall(item: AgentTimelineItem): item is ToolCallTimelineItem {
  // Mirrors the original isGroupableToolCall: plan-detail and "speak" calls are
  // never grouped; everything non-claimed is a separator.
  return (
    item.type === "tool_call" &&
    item.detail.type === "unknown" &&
    item.name.trim().toLowerCase() !== "speak"
  );
}

function boundaryIdentity(item: AgentTimelineItem): string | undefined {
  if (item.type === "assistant_message" && item.messageId) {
    return `assistant_message:${item.messageId}`;
  }
  if (item.type === "tool_call") return `tool_call:${item.callId}`;
  // Streaming rows without per-row ids: repeated updates are the same logical
  // row, so the first boundary anchor wins and later chunks never add a
  // separator. Tradeoff: a genuinely NEW reasoning/todo row also keeps the old
  // anchor instead of splitting the runs after it.
  if (item.type === "reasoning") return "reasoning";
  if (item.type === "todo") return "todo";
  if (item.type === "compaction") return "compaction";
  return undefined;
}

function isPaseoCall(name: string, normalizedName: string): boolean {
  return isPaseoToolName(name) || normalizedName.startsWith(DIRECT_PASEO_TOOL_PREFIX);
}

function isSearchCall(normalizedName: string): boolean {
  return DIRECT_SEARCH_TOOL_SUFFIX_PATTERN.test(normalizedName);
}

export function buildToolCallGroup(
  hostCallId: string,
  calls: readonly ToolCallTimelineItem[],
): ToolCallGroup {
  const editedFiles = new Set<string>();
  const readFiles = new Set<string>();
  let isLoading = false;
  let failedCount = 0;
  let canceledCount = 0;
  let commandCount = 0;
  let searchCount = 0;
  let otherToolCount = 0;
  let paseoCallCount = 0;

  for (const call of calls) {
    const normalizedName = call.name.trim().toLowerCase();
    if (call.status === "running") isLoading = true;
    if (call.status === "failed") failedCount += 1;
    if (call.status === "canceled") canceledCount += 1;
    if (isPaseoCall(call.name, normalizedName)) {
      paseoCallCount += 1;
    } else if (call.detail.type === "edit" || call.detail.type === "write") {
      editedFiles.add(call.detail.filePath);
    } else if (call.detail.type === "shell") {
      commandCount += 1;
    } else if (call.detail.type === "read") {
      readFiles.add(call.detail.filePath);
    } else if (call.detail.type === "search" || isSearchCall(normalizedName)) {
      searchCount += 1;
    } else {
      otherToolCount += 1;
    }
  }

  return {
    id: hostCallId,
    hostCallId,
    calls,
    isLoading,
    failedCount,
    canceledCount,
    summary: {
      editedFileCount: editedFiles.size,
      commandCount,
      readFileCount: readFiles.size,
      searchCount,
      otherToolCount,
      paseoCallCount,
    },
  };
}

function toEntry(pageEntry: GroupingPageEntry): GroupingEntry {
  if (isClaimedToolCall(pageEntry.item)) {
    return {
      kind: "call",
      callId: pageEntry.item.callId,
      turnId: pageEntry.turnId,
      seq: pageEntry.seqStart,
      anchorSeq: pageEntry.seqStart,
      lastSeq: pageEntry.seqEnd ?? pageEntry.seqStart,
      item: pageEntry.item,
    };
  }
  return {
    kind: "boundary",
    seq: pageEntry.seqStart,
    turnId: pageEntry.turnId,
    identity: boundaryIdentity(pageEntry.item),
  };
}

function topSeq(entries: readonly GroupingEntry[]): number {
  let max = 0;
  for (const entry of entries) max = Math.max(max, entry.seq);
  return max;
}

function applyHistory(state: GroupingState, page: GroupingHistoryPage): GroupingState {
  const replace = page.reset || page.gap === true || state.entries.length === 0;
  if (replace) {
    const entries = page.entries.map(toEntry);
    return {
      ...state,
      status: "ready",
      epoch: page.epoch,
      entries,
      hasOlder: page.hasOlder,
      minSeq: entries.length > 0 ? Math.min(...entries.map((e) => e.seq)) : state.minSeq,
      nextLiveSeq: Math.max(state.nextLiveSeq, topSeq(entries) + 1),
      needsReset: false,
    };
  }

  // Older page: prepend as a block. Existing entries are never reordered;
  // duplicates upsert by seqEnd freshness (never by the seqStart anchor).
  const entryByCallId = new Map<string, GroupingEntry>();
  const seenBoundarySeqs = new Set<number>();
  for (const entry of state.entries) {
    if (entry.kind === "call") entryByCallId.set(entry.callId, entry);
    else seenBoundarySeqs.add(entry.seq);
  }
  const fresh: GroupingEntry[] = [];
  let updates: Array<{ index: number; entry: GroupingEntry }> | null = null;
  for (const pageEntry of page.entries) {
    const entry = toEntry(pageEntry);
    if (entry.kind === "call") {
      const existing = entryByCallId.get(entry.callId);
      if (existing) {
        const seqEnd = pageEntry.seqEnd;
        if (
          existing.kind === "call" &&
          seqEnd !== undefined &&
          seqEnd >= existing.lastSeq &&
          state.entries.includes(existing)
        ) {
          updates ??= [];
          const updated: GroupingEntry = {
            ...existing,
            lastSeq: seqEnd,
            item: entry.item,
          };
          updates.push({ index: state.entries.indexOf(existing), entry: updated });
          entryByCallId.set(entry.callId, updated);
        }
        continue;
      }
      entryByCallId.set(entry.callId, entry);
    } else {
      if (seenBoundarySeqs.has(entry.seq)) continue;
      seenBoundarySeqs.add(entry.seq);
    }
    fresh.push(entry);
  }
  let entries = [...fresh, ...state.entries];
  if (updates) {
    entries = entries.slice();
    for (const update of updates) {
      entries[update.index + fresh.length] = update.entry;
    }
  }
  return {
    ...state,
    status: "ready",
    epoch: page.epoch,
    entries,
    hasOlder: page.hasOlder,
    minSeq:
      entries.length > 0
        ? Math.min(state.minSeq ?? Number.POSITIVE_INFINITY, ...entries.map((e) => e.seq))
        : state.minSeq,
    nextLiveSeq: Math.max(state.nextLiveSeq, topSeq(entries) + 1),
    needsReset: false,
  };
}

function advanceLiveSeq(state: GroupingState, seq: number | undefined): number {
  return seq === undefined ? state.nextLiveSeq + 1 : Math.max(state.nextLiveSeq, seq + 1);
}

/** Lifecycle merge: same callId updates in place, keeping its FIRST position,
 * anchor seq, and turnId. Newer snapshots only. */
function mergeStreamCall(
  state: GroupingState,
  item: ToolCallTimelineItem,
  liveSeq: number,
  turnId: string | undefined,
  eventSeq: number | undefined,
): GroupingState {
  const index = state.entries.findIndex(
    (entry) => entry.kind === "call" && entry.callId === item.callId,
  );
  if (index < 0) {
    const entry: GroupingEntry = {
      kind: "call",
      callId: item.callId,
      turnId,
      seq: liveSeq,
      anchorSeq: liveSeq,
      lastSeq: liveSeq,
      item,
    };
    return {
      ...state,
      entries: [...state.entries, entry],
      nextLiveSeq: advanceLiveSeq(state, eventSeq),
    };
  }
  const existing = state.entries[index]!;
  if (existing.kind !== "call") return state;
  const newer = eventSeq === undefined || eventSeq >= existing.lastSeq;
  const updated: GroupingEntry = {
    ...existing,
    lastSeq: newer ? Math.max(existing.lastSeq, eventSeq ?? existing.lastSeq) : existing.lastSeq,
    item: newer ? item : existing.item,
  };
  const entries = state.entries.slice();
  entries[index] = updated;
  return { ...state, entries };
}

/** Non-tool or specialized tool_call row: separator. Boundaries keep no data —
 * only seq/turnId and an identity, so repeated streamed updates for the same
 * message/call keep their FIRST anchor instead of adding later separators. */
function mergeStreamBoundary(
  state: GroupingState,
  item: AgentTimelineItem,
  liveSeq: number,
  turnId: string | undefined,
  eventSeq: number | undefined,
): GroupingState {
  const identity = boundaryIdentity(item);
  if (identity && state.entries.some((e) => e.kind === "boundary" && e.identity === identity)) {
    return state; // same message/call again: first boundary anchor wins
  }
  const trailing = state.entries.at(-1);
  if (trailing?.kind === "boundary" && (identity === undefined || trailing.identity === identity)) {
    // Redundant consecutive non-tool boundary (identity-less chunk, or another
    // update of the trailing row): collapse into the existing separator.
    return state;
  }
  if (state.entries.some((entry) => entry.kind === "boundary" && entry.seq === liveSeq)) {
    return state;
  }
  const entry: GroupingEntry = { kind: "boundary", seq: liveSeq, turnId, identity };
  return {
    ...state,
    entries: [...state.entries, entry],
    nextLiveSeq: advanceLiveSeq(state, eventSeq),
  };
}

function applyStream(state: GroupingState, event: GroupingStreamEvent): GroupingState {
  if (state.status === "error") return state;
  // A live event from a different epoch invalidates the fetched window.
  if (event.epoch && state.epoch && event.epoch !== state.epoch) {
    return applyReplacement();
  }
  const liveSeq = event.seq ?? state.nextLiveSeq;
  return isClaimedToolCall(event.item)
    ? mergeStreamCall(state, event.item, liveSeq, event.turnId, event.seq)
    : mergeStreamBoundary(state, event.item, liveSeq, event.turnId, event.seq);
}

function applyReplacement(): GroupingState {
  return {
    status: "loading",
    epoch: null,
    entries: [],
    hasOlder: false,
    minSeq: null,
    nextLiveSeq: 1,
    needsReset: false,
  };
}

export function applyGroupingAction(state: GroupingState, action: GroupingAction): GroupingState {
  switch (action.type) {
    case "history":
      return applyHistory(state, action.page);
    case "stream":
      return applyStream(state, action.event);
    case "replacement":
      return applyReplacement();
    case "restored":
      return { ...state, needsReset: true };
    case "streamError":
    case "fetchError":
      return { ...state, status: "error" };
  }
}

export interface GroupingIndex {
  /** Every claimed callId -> its group (host and members alike). */
  groupsByCallId: ReadonlyMap<string, ToolCallGroup>;
}

export function buildGroupIndex(state: GroupingState): GroupingIndex {
  const groupsByCallId = new Map<string, ToolCallGroup>();
  let run: ToolCallTimelineItem[] = [];
  let runTurn: string | undefined;
  let inRun = false;

  const flush = () => {
    if (run.length === 0) return;
    const group = buildToolCallGroup(run[0]!.callId, run);
    for (const call of run) groupsByCallId.set(call.callId, group);
    run = [];
    inRun = false;
  };

  for (const entry of state.entries) {
    if (entry.kind === "call" && isClaimedToolCall(entry.item)) {
      if (inRun && runTurn === entry.turnId) {
        run.push(entry.item);
      } else {
        flush();
        run = [entry.item];
        runTurn = entry.turnId;
        inRun = true;
      }
      continue;
    }
    flush();
  }
  flush();

  return { groupsByCallId };
}

/** The row that renders the group: the logical first anchor when it is
 * mounted, otherwise the earliest mounted member, so visible rows never
 * disappear. The group's `id` stays the first source anchor regardless. */
export function effectiveHostCallId(group: ToolCallGroup, mounted: ReadonlySet<string>): string {
  for (const call of group.calls) {
    if (mounted.has(call.callId)) return call.callId;
  }
  return group.id;
}
