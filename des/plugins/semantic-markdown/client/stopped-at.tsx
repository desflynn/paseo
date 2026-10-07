import { getPaseoClient } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";

import { formatStoppedAt } from "../shared/stopped-at.ts";

type AgentHandle = ReturnType<ReturnType<typeof getPaseoClient>["agents"]["ref"]>;

interface AgentHaltState {
  halted: boolean;
  /** Epoch ms of the timeline's last item, from the tail refetch. */
  lastItemAt: number | null;
}

interface StoreEntry extends AgentHaltState {
  refs: number;
  handle: AgentHandle | null;
  unsubscribeStatus: (() => void) | null;
  /** One refetch per halt: rearmed when the agent runs again. */
  haltHandled: boolean;
  listeners: Set<() => void>;
}

// One shared store per agentId: every mounted message of an agent subscribes to
// the same handle and the same halt state. Read-only lifecycle — refresh(),
// timeline.refetch() and subscribe() only. Never detach(): that is a daemon
// write (agent.detach.request) and would detach the agent itself on unmount.
const stores = new Map<string, StoreEntry>();

function readStore(agentId: string): AgentHaltState {
  const entry = stores.get(agentId);
  return entry
    ? { halted: entry.halted, lastItemAt: entry.lastItemAt }
    : { halted: false, lastItemAt: null };
}

function notify(entry: StoreEntry): void {
  for (const listener of entry.listeners) listener();
}

function applyStatus(entry: StoreEntry, handle: AgentHandle, status: string | null): void {
  const halted = status !== null && status !== "running";
  if (!halted) {
    if (entry.halted || entry.haltHandled) {
      entry.halted = false;
      entry.haltHandled = false;
      notify(entry);
    }
    return;
  }
  if (entry.halted) return;
  entry.halted = true;
  entry.haltHandled = true;
  notify(entry);
  void fetchTail(entry, handle);
}

async function fetchTail(entry: StoreEntry, handle: AgentHandle): Promise<void> {
  try {
    const payload = await handle.timeline.refetch({ direction: "tail", limit: 1 });
    const last = payload.entries.at(-1);
    const at = last ? new Date(last.timestamp).getTime() : Number.NaN;
    if (!Number.isNaN(at) && at !== entry.lastItemAt) {
      entry.lastItemAt = at;
      notify(entry);
    }
  } catch {
    // Swallowed: no line beats a crash.
  }
}

async function refreshStatus(entry: StoreEntry, handle: AgentHandle): Promise<void> {
  try {
    const result = await handle.refresh();
    if (result) applyStatus(entry, handle, result.agent.status);
  } catch {
    // Swallowed: no line beats a crash.
  }
}

function bootstrap(entry: StoreEntry, hostId: string, agentId: string): void {
  try {
    entry.handle = getPaseoClient(hostId).agents.ref(agentId);
  } catch {
    return;
  }
  const handle = entry.handle;
  void refreshStatus(entry, handle);
  try {
    entry.unsubscribeStatus = handle.subscribe((update) => {
      if (update.kind === "upsert") applyStatus(entry, handle, update.agent.status);
    });
  } catch {
    entry.unsubscribeStatus = null;
  }
}

function acquire(hostId: string, agentId: string): StoreEntry {
  let entry = stores.get(agentId);
  if (!entry) {
    entry = {
      refs: 0,
      handle: null,
      unsubscribeStatus: null,
      halted: false,
      lastItemAt: null,
      haltHandled: false,
      listeners: new Set(),
    };
    stores.set(agentId, entry);
  }
  entry.refs += 1;
  if (!entry.handle) bootstrap(entry, hostId, agentId);
  return entry;
}

function release(agentId: string, listener: () => void): void {
  const entry = stores.get(agentId);
  if (!entry) return;
  entry.listeners.delete(listener);
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.unsubscribeStatus?.();
  stores.delete(agentId);
}

/** "Stopped at 16:04" under the last assistant message once the agent halts. */
export function useStoppedAt(hostId: string, agentId: string, timestamp: Date): string | null {
  const [snapshot, setSnapshot] = useState<AgentHaltState>(() => readStore(agentId));
  useEffect(() => {
    const entry = acquire(hostId, agentId);
    const listener = () => setSnapshot(readStore(agentId));
    entry.listeners.add(listener);
    listener();
    return () => release(agentId, listener);
  }, [hostId, agentId]);
  if (!snapshot.halted || snapshot.lastItemAt === null) return null;
  // The final item only: this message must be at or after the timeline tail.
  if (timestamp.getTime() < snapshot.lastItemAt) return null;
  return formatStoppedAt(timestamp, new Date());
}
