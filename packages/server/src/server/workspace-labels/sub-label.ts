import type { Logger } from "pino";

import type { WorkspaceLabelService } from "./index.js";

// SUB overlay (des/overlays): agent-created agents alone in their workspace get the SUB workspace label.
export function maybeApplySubLabel(deps: {
  agentId: string | null | undefined;
  workspaceId: string | null | undefined;
  agentManager: { listAgents(): Array<{ id: string; workspaceId?: string }> };
  workspaceLabelService?: Pick<WorkspaceLabelService, "setAssignment"> | null;
  logger: Logger;
}): void {
  const { agentId, workspaceId, agentManager, workspaceLabelService, logger } = deps;
  if (!agentId || !workspaceId || !workspaceLabelService) return;
  const occupied = agentManager
    .listAgents()
    .some((agent) => agent.id !== agentId && agent.workspaceId === workspaceId);
  if (occupied) return;
  workspaceLabelService
    .setAssignment({
      workspaceId,
      label: { name: "SUB", color: "sky" },
      assigned: true,
    })
    .catch((error) => {
      logger.warn({ err: error, workspaceId }, "Failed to assign SUB workspace label");
    });
}
