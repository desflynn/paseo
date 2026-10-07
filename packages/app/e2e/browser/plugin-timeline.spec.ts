import { test, expect } from "../support/fixtures";
import path from "node:path";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import {
  withTimelinePlugin,
  requestPluginTimeline,
  interactWithStreamingCard,
  expectWholeCompletedCard,
  expectBothConsecutiveTools,
} from "../support/helpers/plugin-timeline";

function rewriteMcpMessage(
  message: string | Buffer,
  agentId: string,
  groupedHistory = false,
  serverName = "dci",
): string | Buffer {
  const raw = typeof message === "string" ? message : message.toString("utf8");
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return message;
  }
  const payload = envelope.message?.payload;
  if (payload?.agentId !== agentId) return message;
  const rewriteItem = (item: Record<string, unknown>) => {
    if (item.type !== "tool_call") return;
    item.name = serverName === "paseo" ? "paseo.get_agents" : "dci.wiki_search";
    item.metadata = {
      ...(item.metadata as Record<string, unknown>),
      toolDisplayName: serverName === "paseo" ? "Paseo > Get Agents" : "Dci > Wiki Search",
    };
    item.detail = {
      type: "unknown",
      input: { query: "fixture" },
      output:
        item.status === "running"
          ? null
          : {
              structuredContent: {
                matchCount: 1,
                results: [{ title: "First result", snippet: "Plugin-only inspection fixture." }],
              },
            },
    };
  };
  if (payload.event?.item) rewriteItem(payload.event.item);
  if (!Array.isArray(payload.entries)) return JSON.stringify(envelope);
  for (const entry of payload.entries) if (entry.item) rewriteItem(entry.item);
  if (!groupedHistory) return JSON.stringify(envelope);
  const index = payload.entries.findIndex(
    (entry: { item?: { type?: string } }) => entry.item?.type === "tool_call",
  );
  if (index < 0) return JSON.stringify(envelope);
  const first = payload.entries[index];
  const anchor = first.seqStart;
  for (const entry of payload.entries) {
    if (entry.seqStart > anchor) entry.seqStart += 2;
    if (entry.seqEnd > anchor) entry.seqEnd += 2;
  }
  const clones = ["failed", "canceled"].map((status, offset) => {
    const clone = structuredClone(first);
    clone.seqStart = anchor + offset + 1;
    clone.seqEnd = clone.seqStart;
    Object.assign(clone.item, {
      callId: `${first.item.callId}:${status}`,
      status,
      error: status === "failed" ? "Fixture failure" : null,
    });
    clone.item.metadata.toolDisplayName = `${serverName === "paseo" ? "Paseo" : "Dci"} > ${status === "failed" ? "Failed" : "Canceled"} Search`;
    return clone;
  });
  payload.entries.splice(index + 1, 0, ...clones);
  if (typeof payload.endCursor?.seq === "number") payload.endCursor.seq += 2;
  return JSON.stringify(envelope);
}

for (const width of [1100, 390]) {
  test(`assistant plugin receives the whole streaming message at width ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await withTimelinePlugin(page, info, "assistant", async (agent) => {
      await requestPluginTimeline(agent);
      await interactWithStreamingCard(page);
      await agent.client.waitForFinish(agent.agentId, 30_000);
      await expectWholeCompletedCard(page);
      // Local state is checked during growth; the viewport remounts on the history handoff.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectWholeCompletedCard(page);
    });
  });
}

for (const width of [1100, 390]) {
  test(`tool-results spike inspection preserves raw output at width ${width}`, async ({
    page,
  }, info) => {
    info.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ toolCallDetailLevel: "overview" }),
      );
    });
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "tool-results-spike-",
      title: "Tool-results mock agent",
      model: "ten-second-stream",
    });
    const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
    const previous = await client.getDaemonConfig();
    let installed = false;
    try {
      await openAgentRoute(page, agent);
      await agent.client.sendAgentMessage(agent.agentId, "Exercise native tool rows.");
      await agent.client.waitForFinish(agent.agentId, 30_000);
      const nativeGroup = page.getByTestId("tool-call-group").first();
      await expect(nativeGroup).toBeVisible();
      await client.patchDaemonConfig({ pluginsEnabled: true });
      await client.installDirectoryPlugin(
        path.resolve(process.cwd(), "../../des/plugins/tool-results-spike"),
      );
      installed = true;
      await expect(nativeGroup).toBeVisible();
      if (width === 390) await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await page.getByText("Tool results spike", { exact: true }).last().click();
      await page.getByRole("button", { name: "Inspect", exact: true }).click();
      await expect(page.getByText("Build agent", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Wiki", exact: true }).click();
      await page.getByRole("button", { name: "Inspect", exact: true }).click();
      await expect(
        page.getByText("Cross-platform timeline contributions.", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `/tmp/tool-results-spike-${width}.png` });
      await page.getByRole("button", { name: "Raw", exact: true }).click();
      await expect(page.getByText(/"structuredContent"/)).toBeVisible();
      await openAgentRoute(page, agent);
      await expect(nativeGroup).toBeVisible();
    } finally {
      if (installed) await client.removePlugin("tool-results-spike");
      await client.patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled ?? false });
      await client.close();
      await agent.cleanup();
    }
  });
}

for (const width of [1100, 390]) {
  test(`tool-results spike streamed MCP-shaped rows preserve raw output at width ${width}`, async ({
    page,
  }, info) => {
    info.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "tool-results-rows-",
      title: "MCP row fixture",
      model: "ten-second-stream",
    });
    const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
    const previous = await client.getDaemonConfig();
    let installed = false;
    try {
      await client.patchDaemonConfig({ pluginsEnabled: true });
      await client.installDirectoryPlugin(
        path.resolve(process.cwd(), "../../des/plugins/tool-results-spike"),
      );
      installed = true;
      await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => {
          ws.send(rewriteMcpMessage(message, agent.agentId));
        });
      });
      await openAgentRoute(page, agent);
      await agent.client.sendAgentMessage(agent.agentId, "Exercise MCP result rows.");
      await expect(page.getByText("Dci > Wiki Search", { exact: true }).first()).toBeVisible();
      await agent.client.waitForFinish(agent.agentId, 30_000);
      // Default preference is detailed/one-by-one: rows render individually.
      await expect(page.getByRole("button", { name: /^Used \d+ other tools$/ })).toHaveCount(0);
      await page.getByRole("button", { name: "Dci > Wiki Search", exact: true }).first().click();
      await page.getByRole("button", { name: "Inspect", exact: true }).first().click();
      await expect(page.getByText("First result", { exact: true })).toBeVisible();
      await page.screenshot({ path: `/tmp/tool-results-real-rows-${width}.png` });
      await page.getByRole("button", { name: "Raw", exact: true }).first().click();
      await expect(page.getByText(/"structuredContent"/).first()).toBeVisible();
    } finally {
      if (installed) await client.removePlugin("tool-results-spike");
      await client.patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled ?? false });
      await client.close();
      await agent.cleanup();
    }
  });
}

for (const { width, serverName } of [
  { width: 1100, serverName: "dci" },
  { width: 390, serverName: "dci" },
  { width: 1100, serverName: "paseo" },
]) {
  const serverLabel = serverName === "paseo" ? "Paseo" : "Dci";
  test(`tool-results spike groups ${serverName} history with failed and canceled members at width ${width}`, async ({
    page,
  }, info) => {
    info.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ toolCallDetailLevel: "overview" }),
      );
    });
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "tool-results-groups-",
      title: "Grouped MCP fixture",
      model: "ten-second-stream",
    });
    const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
    const previous = await client.getDaemonConfig();
    let installed = false;
    try {
      await client.patchDaemonConfig({ pluginsEnabled: true });
      await client.installDirectoryPlugin(
        path.resolve(process.cwd(), "../../des/plugins/tool-results-spike"),
      );
      installed = true;
      await agent.client.sendAgentMessage(agent.agentId, "Create result history.");
      await agent.client.waitForFinish(agent.agentId, 30_000);
      await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) =>
          ws.send(rewriteMcpMessage(message, agent.agentId, true, serverName)),
        );
      });
      await openAgentRoute(page, agent);
      const group = page
        .getByRole("button", {
          name: serverName === "paseo" ? /^Called Paseo \d+ times$/ : /^Used \d+ other tools$/,
        })
        .first();
      await expect(group).toBeVisible();
      await expect(group).toContainText("1 failed");
      await expect(group).toContainText("1 canceled");
      await group.click();
      await page
        .getByRole("button", { name: `${serverLabel} > Failed Search`, exact: true })
        .click();
      await page.getByRole("button", { name: "Raw", exact: true }).first().click();
      const rawFailure = page.getByText(/"error": "Fixture failure"/).first();
      await rawFailure.scrollIntoViewIfNeeded();
      await expect(rawFailure).toBeInViewport();
      await page.screenshot({ path: `/tmp/tool-results-groups-${serverName}-${width}.png` });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(group).toBeVisible();
      await group.click();
      await expect(
        page.getByRole("button", { name: `${serverLabel} > Canceled Search`, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: `${serverLabel} > Canceled Search`, exact: true })
        .click();
      await page.getByRole("button", { name: "Raw", exact: true }).first().click();
      await expect(page.getByText(/"status": "canceled"/).first()).toBeVisible();
    } finally {
      if (installed) await client.removePlugin("tool-results-spike");
      await client.patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled ?? false });
      await client.close();
      await agent.cleanup();
    }
  });
}

test("Overview preserves both consecutive tool plugin cards", async ({ page }, info) => {
  await withTimelinePlugin(page, info, "tools", async (agent) => {
    await requestPluginTimeline(agent);
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await expectBothConsecutiveTools(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectBothConsecutiveTools(page);
  });
});
