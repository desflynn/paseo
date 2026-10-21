# GROUP-WORKLOG — tool-results-spike grouping engine + SDK observation

Owner of this file: grouping/observation helper. Parent owns renderer/index/E2E;
presentation-parity helper owns its own files. `shared/tool-call.ts` is read-only.

## Exact public exports

### `shared/grouping.ts` (pure, testable; deps: `@getpaseo/protocol/agent-types`, `@getpaseo/protocol/tool-name-normalization`)

```ts
// A group of consecutive claimed unknown-detail tool calls.
export interface OverviewSummary {
  editedFileCount: number;
  commandCount: number;
  readFileCount: number;
  searchCount: number;
  otherToolCount: number;
  paseoCallCount: number;
}

export interface ToolCallGroup {
  /** Host callId — the first member of the run. Aliased verbatim as `hostCallId`. */
  id: string;
  /** Same value as `id`, for the parent's convenience. */
  hostCallId: string;
  /** Canonical source items, in timeline order; parent derives ToolRowData from these. */
  calls: readonly ToolCallTimelineItem[];
  summary: OverviewSummary;
  isLoading: boolean; // any member status "running"
  failedCount: number;
  canceledCount: number;
}

// Structural input types (FetchAgentTimelinePayload / live timeline events are
// directly assignable — SDK item payloads are typed as AgentTimelineItem).
export interface GroupingPageEntry {
  item: AgentTimelineItem;
  turnId?: string;
  seqStart: number; // first-seen anchor
  seqEnd?: number; // freshness; lifecycle comparisons use this, never seqStart
}
export interface GroupingHistoryPage {
  epoch: string;
  reset: boolean;
  hasOlder: boolean;
  startCursor: unknown; // pass-through into refetch({ cursor })
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
      seq: number;
      anchorSeq: number;
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
  needsReset: boolean; // subscription_restored seen; refetch pending
}

export type GroupingAction =
  | { type: "history"; page: GroupingHistoryPage }
  | { type: "stream"; event: GroupingStreamEvent }
  | { type: "replacement" }
  | { type: "restored" }
  | { type: "streamError" }
  | { type: "fetchError" };

export function initialGroupingState(): GroupingState;
export function applyGroupingAction(state: GroupingState, action: GroupingAction): GroupingState;

export function isClaimedToolCall(item: AgentTimelineItem): item is ToolCallTimelineItem;

export function buildToolCallGroup(
  hostCallId: string,
  calls: readonly ToolCallTimelineItem[],
): ToolCallGroup;

/** The row that renders the group: the logical first anchor (group.id) when it
 *  is mounted, otherwise the earliest mounted member, so visible rows never
 *  disappear. group.id itself always stays the first source anchor. */
export function effectiveHostCallId(group: ToolCallGroup, mounted: ReadonlySet<string>): string;

export interface GroupingIndex {
  /** Every claimed callId -> its group (host and members alike). */
  groupsByCallId: ReadonlyMap<string, ToolCallGroup>;
}
export function buildGroupIndex(state: GroupingState): GroupingIndex;
```

Reducer invariants (tested):

- Lifecycle merge: same `callId` upserts in place; keeps FIRST position, first
  anchor seq, first turnId; item updates only from seq >= lastSeq. Never a
  duplicate. History call entries take `lastSeq` from `seqEnd` (freshness), so
  a fresh history duplicate upserts even when its `seqStart` anchor is old;
  stale duplicates (seqEnd < lastSeq) never clobber a fresher live item.
- No reordering by completed/latest seq, and never across separators. Older
  history pages prepend as a block; live appends; boundary entries split runs.
- Separators: any non-claimed item (specialized tool_call, assistant/user/reasoning/
  todo/error/notification/compaction/plugin rows) and any turnId change.
  "speak"-named and plan-detail tool calls are NEVER groupable (mirrors the
  original isGroupableToolCall) — they are separators.
- `reset` (or first page with `epoch: null` on the store) replaces entries wholesale.
- `replacement` clears to `loading` (old epoch invalid); `restored` keeps stale
  entries and raises `needsReset`; errors → `status: "error"` (rows fall back).

### `client/use-tool-groups.ts`

```ts
export interface UseToolGroupsResult {
  /** undefined => render the individual row (loading, error, or not a claimed call). */
  group?: ToolCallGroup;
  /** True only when group is defined and this row is the effective host. */
  isHost: boolean;
}

export function useToolGroups(
  agentId: string,
  currentSourceItem: ToolCallTimelineItem,
  hostId: string,
): UseToolGroupsResult;
```

- `hostId` is `PluginTimelineItemProps.host.id` (daemon identity), NOT a
  callId. The shared observation is keyed by hostId+agentId. The row's identity
  is `currentSourceItem.callId`.
- `isHost`: effective host = `effectiveHostCallId(group, mounted)` — the
  logical first anchor when it is mounted, else the earliest mounted member
  (mount state = per-call refCounts in the snapshot), so all visible rows keep
  a renderer even when the logical first member is outside the window.
- One shared observation store per hostId+agentId (module-level map): exactly
  one `timeline.refetch` history fetch + one `timeline.subscribe` per viewed
  agent. No polling. No network during render: `getObservation` only allocates;
  the store starts on the first mounted acquire and disposes (unsubscribes,
  drops from map) when the last listener+acquire releases. A store disposed by
  StrictMode setup/cleanup revives on the next acquire, so the memoized
  reference is never stranded.
- One shared observation store per agentId (module-level map): exactly one
  `timeline.refetch` history fetch + one `timeline.subscribe` per viewed agent.
  No polling. Reference-counted per callId (`wantedCallIds`); last unsubscribe
  tears the store down (unsubscribes, drops from map).
- Event-driven: `agent_stream` timeline events merge live; `replacement` clears +
  refetches; `subscription_restored` marks needsReset + refetches; `error` →
  fallback. Epoch mismatch on a live event is treated as replacement.
- Backfill: bounded (max 5 pages) `direction: "before"` fetches, only while a
  wanted callId is missing from the covered window and `hasOlder`. No unbounded drain.
- Snapshots: `{ state, index, mounted }` built together; `getSnapshot` returns
  a stable ref until state or mount set changes; `useSyncExternalStore` drives
  renders. Mount/unmount of any member republishes so every member row
  recomputes `isHost`.

## Units

- [x] U1 skeleton (this file)
- [x] U2 RED tests: shared/grouping.test.ts (29 tests incl. boundary regressions)
- [x] U3 GREEN: shared/grouping.ts
- [x] U4 hook: client/use-tool-groups.ts
- [x] U5 typecheck + scoped lint + notes
- [x] U6 integration corrections: hostId=host.id keying; start-on-acquire +
      StrictMode revive; seqEnd freshness; effectiveHostCallId + missing-first-host tests

Verification: `npx vitest run des/plugins/tool-results-spike/shared/grouping.test.ts
--bail=1` → 29/29; plugin existing suites (results, tool-call) → 21/21 untouched;
plugin `tsc --noEmit` clean; scoped `npm run lint` 0 warnings 0 errors.

## Tradeoffs / notes

- Groups contain ONLY claimed unknown-detail calls (spike scope); specialized
  calls and non-tool rows are separators, matching parent's renderer contract.
- `restored` keeps stale entries until the reset refetch lands (no flicker to
  fallback), then rebuilds authoritatively.
- `replacement` clears first: old-epoch rows may not exist in the new epoch.
- Boundary entries keep only seq/turnId, not item data — source data lives in the
  row's own ToolRowData; the engine never drops member source items.
- Live events with a newer epoch than the fetched one are treated as replacement.
- Boundary identity: separators carry an identity key so repeated streamed
  updates retain their FIRST boundary anchor and never add a later separator
  after an interleaved call: `assistant_message:<messageId>` (when present),
  `tool_call:<callId>` (specialized call updates), and type-level `reasoning`,
  `todo`, `compaction` (no per-row ids exist). Redundant consecutive boundaries
  collapse (identity-less chunk, or same identity as the trailing boundary);
  distinct identified boundaries both stay so later chunks anchor correctly.
  Boundaries keep no text/data.
- Tradeoff: identity-less streamed rows (reasoning/todo/compaction) share one
  anchor per type, so a genuinely NEW such row after more calls also keeps the
  old anchor instead of splitting the runs after it. Chosen over per-chunk
  separators, which would split groups on every text chunk.
- `TimelineSubscription` is an unsubscribe function with `.ready`/`.release()`;
  teardown calls it (releases demand). SDK types are derived structurally from
  `usePaseo()` (`ReturnType`/`Parameters`/`Awaited`) — no direct
  `@getpaseo/client` import, no invented methods; `FetchAgentTimelinePayload`
  is assignable to `GroupingHistoryPage` as-is (SDK item payloads are typed
  `AgentTimelineItem`).
- First history fetch replaces entries even without `reset` (authoritative
  snapshot); overlap with earlier live arrivals dedupes by callId.
