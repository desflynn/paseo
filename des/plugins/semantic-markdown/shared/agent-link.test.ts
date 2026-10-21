import assert from "node:assert/strict";
import { test } from "node:test";
import { agentLinkTarget } from "./agent-link.ts";

const HOST = "11111111-2222-3333-4444-555555555555";
const AGENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER = "99999999-8888-7777-6666-555555555555";

test("the short form targets the host rendering the chat", () => {
  assert.deepEqual(agentLinkTarget(`agent:${AGENT}`, HOST), {
    kind: "agent",
    serverId: HOST,
    agentId: AGENT,
  });
});

test("the full form on the current host is an agent link", () => {
  assert.deepEqual(agentLinkTarget(`paseo://h/${HOST}/agent/${AGENT}`, HOST), {
    kind: "agent",
    serverId: HOST,
    agentId: AGENT,
  });
});

test("the full form on another server is not navigable", () => {
  assert.deepEqual(agentLinkTarget(`paseo://h/${OTHER}/agent/${AGENT}`, HOST), {
    kind: "other-server",
    serverId: OTHER,
    agentId: AGENT,
  });
});

test("ids must be full UUIDs; anything else falls through", () => {
  assert.equal(agentLinkTarget("agent:abc123", HOST), null);
  assert.equal(agentLinkTarget("agent:", HOST), null);
  assert.equal(
    agentLinkTarget(`agent:${AGENT.slice(0, -1)}`, HOST),
    null,
  );
  assert.equal(agentLinkTarget(`paseo://h/${HOST}/agent/not-a-uuid`, HOST), null);
});

test("plain links fall through to the default handler", () => {
  assert.equal(agentLinkTarget("https://example.com/x", HOST), null);
  assert.equal(agentLinkTarget("mailto:a@b.c", HOST), null);
});

test("file links are not agent links", () => {
  assert.equal(agentLinkTarget("/Users/des/notes.md", HOST), null);
  assert.equal(agentLinkTarget("file:///Users/des/notes.md", HOST), null);
});

test("paseo routes that are not agent tabs fall through", () => {
  assert.equal(agentLinkTarget(`paseo://h/${HOST}/workspace/ws-1`, HOST), null);
  assert.equal(agentLinkTarget(`paseo://h/${HOST}/agent`, HOST), null);
  assert.equal(agentLinkTarget(`paseo://h/${HOST}/agent/${AGENT}/extra`, HOST), null);
  assert.equal(agentLinkTarget(`paseo://h/${HOST}/agent/${AGENT}?open=x`, HOST), null);
});

test("href whitespace is trimmed and UUID hex case does not matter", () => {
  const upper = AGENT.toUpperCase();
  assert.deepEqual(agentLinkTarget(`  agent:${upper}  `, HOST), {
    kind: "agent",
    serverId: HOST,
    agentId: upper,
  });
  assert.deepEqual(agentLinkTarget(` paseo://h/${HOST}/agent/${upper}`, HOST), {
    kind: "agent",
    serverId: HOST,
    agentId: upper,
  });
});

test("encoded route segments decode before matching", () => {
  assert.deepEqual(agentLinkTarget(`paseo://h/${HOST}/agent/${AGENT}/`, HOST), {
    kind: "agent",
    serverId: HOST,
    agentId: AGENT,
  });
});
