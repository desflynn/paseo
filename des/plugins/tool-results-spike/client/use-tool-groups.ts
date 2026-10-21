import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
import type { AgentTimelineItem, ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";
import {
  applyGroupingAction,
  buildGroupIndex,
  effectiveHostCallId,
  initialGroupingState,
  type GroupingAction,
  type GroupingHistoryPage,
  type GroupingIndex,
  type GroupingState,
  type ToolCallGroup,
} from "../shared/grouping";

/**
 * Shared per-host+agent observation over the public SDK: exactly one timeline
 * history fetch + one timeline subscription per viewed host/agent pair,
 * reference-counted across all rows. Drives the pure grouping engine in
 * shared/grouping.ts. No network during render: the store starts on the first
 * mounted acquire and disposes on the last release; a store disposed by
 * StrictMode setup/cleanup revives on the next acquire.
 */

type PaseoApi = ReturnType<typeof usePaseo>;
type AgentHandle = ReturnType<PaseoApi["agents"]["ref"]>;
type TimelineHandle = AgentHandle["timeline"];
type TimelinePayload = Awaited<ReturnType<TimelineHandle["refetch"]>>;
type TimelineEvent = Parameters<Parameters<TimelineHandle["subscribe"]>[0]>[0];
type TimelineRefetchOptions = NonNullable<Parameters<TimelineHandle["refetch"]>[0]>;

const PAGE_LIMIT = 200;
const MAX_BACKFILL_PAGES = 5;

const FALLBACK: UseToolGroupsResult = { group: undefined, isHost: false };

const FALLBACK_SNAPSHOT: Snapshot = {
  state: initialGroupingState(),
  index: { groupsByCallId: new Map() },
  mounted: new Set(),
};

export interface UseToolGroupsResult {
  /** undefined => render the individual row (loading, error, or not claimed). */
  group?: ToolCallGroup;
  /** True only when group is defined and this row is the group's effective host. */
  isHost: boolean;
}

interface Snapshot {
  state: GroupingState;
  index: GroupingIndex;
  /** Row callIds with a live subscriber; decides the effective host. */
  mounted: ReadonlySet<string>;
}

class AgentGroupsObservation {
  private readonly listeners = new Set<() => void>();
  private readonly refCounts = new Map<string, number>();
  /** Every callId ever seen (claimed or not); bounds backfill for unclaimed ids. */
  private readonly knownCallIds = new Set<string>();
  private snapshot: Snapshot = {
    state: initialGroupingState(),
    index: { groupsByCallId: new Map() },
    mounted: new Set(),
  };
  private subscription: ReturnType<TimelineHandle["subscribe"]> | null = null;
  private startPromise: Promise<void> | null = null;
  private lastStartCursor: TimelineRefetchOptions["cursor"];
  private hasOlder = false;
  private refetching = false;
  private disposed = false;

  constructor(
    private readonly paseo: PaseoApi,
    readonly agentId: string,
    private readonly hostId: string,
  ) {}

  get key(): string {
    return `${this.hostId}\u0000${this.agentId}`;
  }

  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.tearDownIfNeeded();
    };
  };

  /** Called from mount effects only — never render. Starts the observation. */
  acquire(callId: string): void {
    if (this.disposed) this.revive();
    this.refCounts.set(callId, (this.refCounts.get(callId) ?? 0) + 1);
    if (!this.startPromise) void this.start();
    else void this.backfillIfNeeded();
    this.publish();
  }

  release(callId: string): void {
    const next = (this.refCounts.get(callId) ?? 0) - 1;
    if (next <= 0) this.refCounts.delete(callId);
    else this.refCounts.set(callId, next);
    this.publish();
    this.tearDownIfNeeded();
  }

  start(): Promise<void> {
    this.startPromise ??= this.runStart();
    return this.startPromise;
  }

  private async runStart(): Promise<void> {
    try {
      const subscription = this.handle().subscribe((event) => this.onEvent(event));
      this.subscription = subscription;
      await subscription.ready;
      await this.fetchPage({ direction: "tail", projection: "canonical", limit: PAGE_LIMIT });
      await this.backfillIfNeeded();
    } catch {
      this.dispatch({ type: "fetchError" });
    }
  }

  private handle(): TimelineHandle {
    return this.paseo.agents.ref(this.agentId).timeline;
  }

  private revive(): void {
    this.disposed = false;
    observations.set(this.key, this);
  }

  private tearDownIfNeeded(): void {
    if (this.listeners.size === 0 && this.refCounts.size === 0) this.tearDown();
  }

  private tearDown(): void {
    this.disposed = true;
    this.startPromise = null;
    this.hasOlder = false;
    this.refetching = false;
    this.refCounts.clear();
    observations.delete(this.key);
    // TimelineSubscription is an unsubscribe function; calling releases demand.
    this.subscription?.();
    this.subscription = null;
  }

  private publish(): void {
    this.snapshot = {
      state: this.snapshot.state,
      index: buildGroupIndex(this.snapshot.state),
      mounted: new Set(this.refCounts.keys()),
    };
    for (const listener of this.listeners) listener();
  }

  private dispatch(action: GroupingAction): void {
    if (this.disposed) return;
    const state = applyGroupingAction(this.snapshot.state, action);
    if (state !== this.snapshot.state) {
      this.snapshot = {
        state,
        index: buildGroupIndex(state),
        mounted: this.snapshot.mounted,
      };
      for (const listener of this.listeners) listener();
    }
  }

  private trackItems(items: readonly AgentTimelineItem[]): void {
    for (const item of items) {
      if (item.type === "tool_call") this.knownCallIds.add(item.callId);
    }
  }

  private onEvent(event: TimelineEvent): void {
    if (this.disposed || event.agentId !== this.agentId) return;
    switch (event.event.type) {
      case "timeline": {
        this.trackItems([event.event.item]);
        const hadEpoch = this.snapshot.state.epoch !== null;
        this.dispatch({
          type: "stream",
          event: {
            type: "timeline",
            item: event.event.item,
            turnId: event.event.turnId,
            seq: "seq" in event ? event.seq : undefined,
            epoch: "epoch" in event ? event.epoch : undefined,
          },
        });
        // A stream event from a newer epoch reduced to a replacement.
        if (hadEpoch && this.snapshot.state.epoch === null) void this.recover();
        return;
      }
      case "replacement":
        this.dispatch({ type: "replacement" });
        void this.recover();
        return;
      case "subscription_restored":
        this.dispatch({ type: "restored" });
        void this.recover();
        return;
      case "error":
        this.dispatch({ type: "streamError" });
        return;
      default:
        return; // turn lifecycle, permissions, attention: not timeline rows
    }
  }

  private async recover(): Promise<void> {
    await this.fetchPage({ direction: "tail", projection: "canonical", limit: PAGE_LIMIT });
    await this.backfillIfNeeded();
  }

  private async fetchPage(options: TimelineRefetchOptions): Promise<void> {
    if (this.disposed || this.refetching) return;
    this.refetching = true;
    try {
      const page: TimelinePayload = await this.handle().refetch(options);
      if (this.disposed) return;
      if (page.error) {
        this.dispatch({ type: "fetchError" });
        return;
      }
      if (this.snapshot.state.needsReset && !page.reset) {
        // Stale entries from a pre-restore epoch: clear before applying.
        this.dispatch({ type: "replacement" });
      }
      this.trackItems(page.entries.map((entry) => entry.item));
      this.lastStartCursor = page.startCursor ?? undefined;
      this.hasOlder = page.hasOlder;
      const historyPage: GroupingHistoryPage = page;
      this.dispatch({ type: "history", page: historyPage });
    } catch {
      this.dispatch({ type: "fetchError" });
    } finally {
      this.refetching = false;
    }
  }

  private missingWanted(): string[] {
    return [...this.refCounts.keys()].filter((callId) => !this.knownCallIds.has(callId));
  }

  private async backfillIfNeeded(): Promise<void> {
    for (let pages = 0; pages < MAX_BACKFILL_PAGES; pages += 1) {
      if (this.disposed || this.refetching || !this.hasOlder) return;
      if (this.missingWanted().length === 0) return;
      const minSeqBefore = this.snapshot.state.minSeq;
      await this.fetchPage({
        direction: "before",
        cursor: this.lastStartCursor,
        projection: "canonical",
        limit: PAGE_LIMIT,
      });
      if (this.disposed || this.snapshot.state.minSeq === minSeqBefore) return;
    }
  }
}

const observations = new Map<string, AgentGroupsObservation>();

/** Allocates/returns the shared store; performs no network work. */
function getObservation(paseo: PaseoApi, agentId: string, hostId: string): AgentGroupsObservation {
  const key = `${hostId}\u0000${agentId}`;
  const existing = observations.get(key);
  if (existing) return existing;
  const created = new AgentGroupsObservation(paseo, agentId, hostId);
  observations.set(key, created);
  return created;
}

/**
 * Group membership for one plugin tool row.
 *
 * @param agentId - the viewed agent.
 * @param currentSourceItem - this row's canonical item (`ToolRowData.source`);
 *   the row's identity is `currentSourceItem.callId`.
 * @param hostId - `PluginTimelineItemProps.host.id` (daemon identity), scoping
 *   the shared observation; NOT a callId.
 * @param enabled - grouping must be off unless the user asked for it. While
 *   false the shared observation is never created or acquired, so
 *   one-by-one rendering performs no subscriptions or fetches.
 * @returns `{ group, isHost }`; `group` is undefined while loading, on error,
 *   or when the call is not a claimed unknown-detail tool call — render the
 *   individual row in that case. `isHost` is true when this row is the group's
 *   effective host: the logical first anchor (group.id) if it is mounted,
 *   otherwise the earliest mounted member, so visible rows never disappear.
 */
export function useToolGroups(
  agentId: string,
  currentSourceItem: ToolCallTimelineItem,
  hostId: string,
  enabled: boolean,
): UseToolGroupsResult {
  const paseo = usePaseo();
  const observation = useMemo(
    () => (enabled ? getObservation(paseo, agentId, hostId) : null),
    [enabled, paseo, agentId, hostId],
  );
  const subscribeNoop = useCallback(() => () => {}, []);
  const snapshot = useSyncExternalStore(
    observation ? observation.subscribe : subscribeNoop,
    observation ? observation.getSnapshot : () => FALLBACK_SNAPSHOT,
  );
  const callId = currentSourceItem.callId;

  useEffect(() => {
    if (!observation) return;
    observation.acquire(callId);
    return () => observation.release(callId);
  }, [observation, callId]);

  return useMemo(() => {
    if (!observation || snapshot.state.status !== "ready") return FALLBACK;
    const group = snapshot.index.groupsByCallId.get(callId);
    if (!group) return FALLBACK;
    return { group, isHost: effectiveHostCallId(group, snapshot.mounted) === callId };
  }, [observation, snapshot, callId]);
}
