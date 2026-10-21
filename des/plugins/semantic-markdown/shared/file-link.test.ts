import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPaneHandler,
  isLocalFileLink,
  workspaceFileLinkUrl,
  workspaceFileRoute,
  workspaceFileRouteFromPath,
} from "./file-link.ts";
import { imageMimeFromPath } from "./read-image.ts";

// Paseo's own encoders (packages/app/src/utils/host-routes.ts) use Node Buffer.
const b64url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const PLAN = "/Users/des/dev/paseo-semantic-renderer-plugin/prod-repo-build-PLAN.md";

test("an absolute path opens as a workspace file tab through Paseo's deep link", () => {
  assert.equal(
    workspaceFileLinkUrl({ serverId: "srv", workspaceId: "ws-1", href: PLAN }),
    `paseo://h/srv/workspace/ws-1?open=${encodeURIComponent(`file:${b64url(PLAN)}`)}`,
  );
});

test("the in-app route is the deep link without its scheme", () => {
  assert.equal(
    workspaceFileRoute({ serverId: "srv", workspaceId: "ws-1", href: PLAN }),
    `/h/srv/workspace/ws-1?open=${encodeURIComponent(`file:${b64url(PLAN)}`)}`,
  );
  assert.equal(
    workspaceFileRoute({ serverId: "srv", workspaceId: "ws-1", href: "https://x" }),
    null,
  );
});

test("on the current workspace page, the route reuses its address", () => {
  assert.equal(
    workspaceFileRouteFromPath("/h/srv/workspace/wks_1/agent/x", PLAN),
    `/h/srv/workspace/wks_1?open=${encodeURIComponent(`file:${b64url(PLAN)}`)}`,
  );
  assert.equal(workspaceFileRouteFromPath("/settings", PLAN), null);
  assert.equal(workspaceFileRouteFromPath("/h/srv/workspace/wks_1", "https://x"), null);
});

test("alternate clicks send a different open value that decodes to the same path", () => {
  const first = workspaceFileRouteFromPath("/h/srv/workspace/wks_1", PLAN, 0)!;
  const second = workspaceFileRouteFromPath("/h/srv/workspace/wks_1", PLAN, 1)!;
  assert.notEqual(first, second);
  // Paseo decodes the router's value once more before base64 (host-routes.ts decodeSegment).
  const payload = (route: string) =>
    decodeURIComponent(
      decodeURIComponent(new URL(`x:${route}`).search.slice("?open=".length)),
    ).slice("file:".length);
  assert.equal(payload(first), payload(second));
  assert.equal(Buffer.from(payload(second), "base64url").toString("utf8"), PLAN);
});

test("phone deep links alternate per click too", () => {
  const input = { serverId: "srv", workspaceId: "ws-1", href: PLAN };
  assert.notEqual(workspaceFileLinkUrl(input, 0), workspaceFileLinkUrl(input, 1));
  assert.equal(workspaceFileLinkUrl(input, 2), workspaceFileLinkUrl(input, 0));
});

test("phone links change the path per click so Expo Router navigates", () => {
  const input = { serverId: "srv", workspaceId: "wks_1", href: PLAN };
  const segment = (url: string) => new URL(url.replace("paseo://", "x://")).pathname.split("/")[3];
  const [a, b] = [
    segment(workspaceFileLinkUrl(input, 0)!),
    segment(workspaceFileLinkUrl(input, 1)!),
  ];
  // Router decodes the path param once; Paseo's decodeSegment decodes it again.
  assert.notEqual(decodeURIComponent(a), decodeURIComponent(b));
  assert.equal(decodeURIComponent(decodeURIComponent(b)), "wks_1");
  assert.equal(decodeURIComponent(decodeURIComponent(a)), "wks_1");
});

test("a file:// URL opens its decoded path", () => {
  assert.equal(
    workspaceFileLinkUrl({
      serverId: "srv",
      workspaceId: "ws-1",
      href: "file:///Users/des/a%20b%C3%A9.md",
    }),
    `paseo://h/srv/workspace/ws-1?open=${encodeURIComponent(`file:${b64url("/Users/des/a bé.md")}`)}`,
  );
});

test("a workspace id that is not URL-safe uses Paseo's b64_ segment", () => {
  assert.equal(
    workspaceFileLinkUrl({ serverId: "srv", workspaceId: "/Users/des/dev/paseo", href: "/x.md" }),
    `paseo://h/srv/workspace/b64_${b64url("/Users/des/dev/paseo")}?open=${encodeURIComponent(`file:${b64url("/x.md")}`)}`,
  );
});

test("web links, relative paths and other schemes are not file links", () => {
  for (const href of [
    "https://paseo.sh",
    "http://x",
    "docs/a.md",
    "javascript:alert(1)",
    "mailto:a@b.c",
    "",
  ]) {
    assert.equal(workspaceFileLinkUrl({ serverId: "srv", workspaceId: "ws-1", href }), null, href);
  }
});

test("local file links are absolute paths and file:// URLs only", () => {
  assert.equal(isLocalFileLink(PLAN), true);
  assert.equal(isLocalFileLink("file:///x.md"), true);
  assert.equal(isLocalFileLink("https://paseo.sh"), false);
  assert.equal(isLocalFileLink("docs/a.md"), false);
});

test("no workspace means no file link", () => {
  assert.equal(workspaceFileLinkUrl({ serverId: "srv", workspaceId: undefined, href: PLAN }), null);
});

test("image mime comes from the extension, only for formats RN Image draws", () => {
  assert.equal(imageMimeFromPath("/Users/des/a.png"), "image/png");
  assert.equal(imageMimeFromPath("/Users/des/a.JPG"), "image/jpeg");
  assert.equal(imageMimeFromPath("/Users/des/a.jpeg"), "image/jpeg");
  assert.equal(imageMimeFromPath("/Users/des/a.gif"), "image/gif");
  assert.equal(imageMimeFromPath("/Users/des/a.webp"), "image/webp");
  // SVG stays out: RN Image cannot draw it on the phone.
  assert.equal(imageMimeFromPath("/Users/des/a.svg"), null);
  assert.equal(imageMimeFromPath("/Users/des/a.md"), null);
  assert.equal(imageMimeFromPath("/Users/des/no-extension"), null);
});

// values[0] is the start fiber, each next value is its parent. Real fibers carry
// `return` (parent) and the provider's context value in memoizedProps.value.
function fiberChain(values: unknown[]): unknown {
  let node: unknown = null;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    node = { memoizedProps: { value: values[i] }, return: node };
  }
  return node;
}

test("the pane walk finds the workspace pane context through fiber parents", () => {
  const pane = { workspaceId: "ws-1", openFileInWorkspace: () => undefined };
  const found = findPaneHandler(fiberChain([null, { hello: 1 }, {}, pane]));
  assert.equal(found.handler, pane);
  assert.equal(found.walked, 4);
});

test("the pane walk skips lookalike values, plain fibers, and counts the walk", () => {
  const found = findPaneHandler(
    fiberChain([
      { workspaceId: "ws-1" },
      { return: null },
      { openFileInWorkspace: () => undefined },
      { openFileInWorkspace: "no", workspaceId: 2 },
    ]),
  );
  assert.equal(found.handler, null);
  assert.equal(found.walked, 4);
});

test("the pane walk stops at the cap and tolerates a missing fiber", () => {
  const pane = { workspaceId: "ws-1", openFileInWorkspace: () => undefined };
  assert.deepEqual(findPaneHandler(fiberChain([{}, {}, pane]), 2), { handler: null, walked: 2 });
  assert.equal(findPaneHandler(fiberChain([pane]), 1).handler, pane);
  assert.deepEqual(findPaneHandler(null), { handler: null, walked: 0 });
  assert.deepEqual(findPaneHandler(undefined, 3), { handler: null, walked: 0 });
});
