// Path links in claimed messages. The SDK's openExternalUrl opens http(s) only, and the
// app's chat file-link action is not exposed to plugins. Paseo's workspace route opens a
// file tab from its URL (`?open=file:<base64url path>`, packages/app/src/utils/host-routes.ts),
// so the plugin deep-links there and Paseo's own file handling does the rest. Encoders
// mirror host-routes.ts byte for byte; no Buffer (the phone's Hermes has none).

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlNoPad(value: string): string {
  const bytes = Array.from(unescape(encodeURIComponent(value)), (char) => char.charCodeAt(0));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function workspaceSegment(workspaceId: string): string {
  return /^[A-Za-z0-9._~-]+$/.test(workspaceId)
    ? workspaceId
    : `b64_${base64UrlNoPad(workspaceId)}`;
}

/** Absolute path of a file link, or null when Paseo would not treat it as a local file. */
export function localFilePath(href: string): string | null {
  if (href.startsWith("/")) return href;
  if (!href.startsWith("file://")) return null;
  try {
    const path = decodeURIComponent(href.slice("file://".length).replace(/^[^/]*/, ""));
    return path.startsWith("/") ? path : null;
  } catch {
    return null;
  }
}

export function isLocalFileLink(href: string): boolean {
  return localFilePath(href.trim()) !== null;
}

interface FileLinkInput {
  serverId: string;
  workspaceId: string | undefined;
  href: string;
}

/** In-app route that opens `href` as a file tab in the agent's workspace, or null. */
export function workspaceFileRoute(input: FileLinkInput, click = 0): string | null {
  const path = localFilePath(input.href.trim());
  const workspaceId = input.workspaceId?.trim();
  if (!path || !workspaceId || !input.serverId) return null;
  const open = openValue(path, click);
  // Expo Router drops a deep link that changes only the query (workspace index.tsx:164), so
  // on the phone every link after the first did nothing. Odd clicks escape the segment's
  // first character: the router's path param differs, and Paseo's decodeSegment recovers it.
  const segment = encodeURIComponent(workspaceSegment(workspaceId));
  const wsPath =
    click % 2 === 1
      ? `%25${segment.charCodeAt(0).toString(16).toUpperCase()}${segment.slice(1)}`
      : segment;
  return `/h/${encodeURIComponent(input.serverId)}/workspace/${wsPath}?open=${open}`;
}

/** Route that opens `href` from the current workspace page address (already encoded), or null. */
// The workspace page ignores an `open` value equal to the last one it consumed
// (workspace/[workspaceId]/index.tsx consumedIntentRef), so a second click on the same
// link did nothing. It decodes the payload once more after the router does, so odd clicks
// escape the first base64 character: a different raw value, the same decoded path.
export function workspaceFileRouteFromPath(
  pathname: string,
  href: string,
  click = 0,
): string | null {
  const page = /^\/h\/[^/]+\/workspace\/[^/?#]+/.exec(pathname);
  const path = localFilePath(href.trim());
  if (!page || !path) return null;
  return `${page[0]}?open=${openValue(path, click)}`;
}

function openValue(path: string, click: number): string {
  const b64 = base64UrlNoPad(path);
  const payload =
    click % 2 === 1 ? `%${b64.charCodeAt(0).toString(16).toUpperCase()}${b64.slice(1)}` : b64;
  return encodeURIComponent(`file:${payload}`);
}

/** The same route as an app deep link (native: the app's own router handles paseo://). */
export function workspaceFileLinkUrl(input: FileLinkInput, click = 0): string | null {
  const route = workspaceFileRoute(input, click);
  return route ? `paseo:/${route}` : null;
}

// --- pane handler walk ---------------------------------------------------------
// The plugin bundle has its own module copies, so it cannot import the app's pane React
// context. A plugin component that renders inside the pane provider can read the
// provider's value off the React fiber chain instead: every fiber links to its parent
// through `return`, and a context provider keeps its value in memoizedProps.value.
// The walk matches by shape, then the plugin calls the same openFileInWorkspace the
// app's own chat link path calls (components/message.tsx), so a tap behaves like one.

/** One fiber as this walk sees it: parent link plus the node props. */
export interface FiberLike {
  return?: FiberLike | null;
  memoizedProps?: { value?: unknown } | null;
}

/** The workspace pane context fields this walk needs (PaneContextValue in Paseo core). */
export interface PaneHandler {
  workspaceId: string;
  openFileInWorkspace(request: {
    location: { path: string; lineStart?: number; lineEnd?: number };
    disposition: "main" | "preferred" | "side";
  }): unknown;
}

export interface PaneHandlerSearch {
  handler: PaneHandler | null;
  /** Fibers visited before the walk stopped. */
  walked: number;
}

/** Walk the fiber chain from `start` up to the workspace pane context, or miss. */
export function findPaneHandler(start: unknown, maxFibers = 500): PaneHandlerSearch {
  let node = start as FiberLike | null | undefined;
  let walked = 0;
  while (node && typeof node === "object" && walked < maxFibers) {
    walked += 1;
    const value = (node.memoizedProps as { value?: unknown } | null | undefined)?.value;
    if (value && typeof value === "object") {
      const candidate = value as Partial<PaneHandler>;
      if (
        typeof candidate.openFileInWorkspace === "function" &&
        typeof candidate.workspaceId === "string"
      ) {
        return { handler: candidate as PaneHandler, walked };
      }
    }
    node = node.return as FiberLike | null | undefined;
  }
  return { handler: null, walked };
}
