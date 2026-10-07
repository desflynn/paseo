// Agent deep links in claimed messages. The short form `agent:<agentId>` targets the host
// rendering the chat; the full form `paseo://h/<serverId>/agent/<agentId>` carries its own
// server — the same route shape packages/app/src/app/h/[serverId]/agent/[agentId].tsx
// serves. Full agent ids only (UUID shape): anything else falls through to the renderer's
// default link path, so file links and plain https links behave exactly as before.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AgentLinkTarget =
  | { kind: "agent"; serverId: string; agentId: string }
  | { kind: "other-server"; serverId: string; agentId: string };

/** Parse an agent deep link, or null when `href` is not one. */
export function agentLinkTarget(href: string, currentHostId: string): AgentLinkTarget | null {
  const trimmed = href.trim();

  const short = /^agent:(\S+)$/i.exec(trimmed);
  if (short) {
    return UUID_RE.test(short[1])
      ? { kind: "agent", serverId: currentHostId, agentId: short[1] }
      : null;
  }

  const full = /^paseo:\/\/h\/([^/?#]+)\/agent\/([^/?#]+)\/?$/i.exec(trimmed);
  if (full) {
    let serverId: string;
    let agentId: string;
    try {
      serverId = decodeURIComponent(full[1]);
      agentId = decodeURIComponent(full[2]);
    } catch {
      return null;
    }
    if (!UUID_RE.test(agentId)) return null;
    return serverId === currentHostId
      ? { kind: "agent", serverId, agentId }
      : { kind: "other-server", serverId, agentId };
  }

  return null;
}
