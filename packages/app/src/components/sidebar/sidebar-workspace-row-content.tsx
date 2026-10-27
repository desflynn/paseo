import { memo, useMemo, useCallback, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  CircleCheck,
  CirclePlay,
  CircleQuestionMark,
  CircleX,
  Pin,
  UserRound,
} from "lucide-react-native";
import { ProjectStatusIndicator } from "@/components/sidebar/project-leading-visual";
import type { SidebarSurfaceBackdrop } from "@/styles/surface-backdrop";
import {
  WorkspaceMetaRow,
  type WorkspaceServiceSummary,
} from "@/components/sidebar/workspace-meta-row";
import { WorkspaceHoverCard } from "@/components/workspace-hover-card";
import type { HostBadgeModel } from "@/hosts/appearance";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  hasSidebarWorkspaceTrailing,
  type SidebarWorkspaceTrailing,
} from "@/components/sidebar/workspace-trailing";
import { useAppSettings } from "@/hooks/use-settings";
import { densityIconBox } from "@/styles/density";
import type { Theme } from "@/styles/theme";
import {
  STATUS_INDICATOR_GLYPH_SIZE,
  PINNED_KIND_MARKER_SIZE,
  PINNED_STATUS_MARKER_SIZE,
} from "@/utils/status-indicator-geometry";
import { StatusRing } from "@/components/status-ring";
import { resolveSidebarWorkspacePrimaryLabel } from "@/components/sidebar/sidebar-workspace-title";
import { TrailingActionScrim } from "@/components/ui/trailing-action-scrim";
import { useWorkspaceLabelDefinitions } from "@/workspace-labels";

const needsInputStatusIconColor = (theme: Theme) => ({
  color: theme.colors.statusDotWarning,
});
const failedStatusIconColor = (theme: Theme) => ({
  color: theme.colors.statusDotDanger,
});
const attentionStatusIconColor = (theme: Theme) => ({
  color: theme.colors.statusDotSuccess,
});
const runningStatusIconColor = (theme: Theme) => ({
  color: theme.colors.statusDotRunning,
});
const pinnedMarkerColor = (theme: Theme) => ({
  color: theme.colors.statusDotWarning,
});

const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCirclePlay = withUnistyles(CirclePlay);
const ThemedCircleQuestionMark = withUnistyles(CircleQuestionMark);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedPin = withUnistyles(Pin);
const ThemedUserRound = withUnistyles(UserRound);

/** Pinned agent seats known by name; their workspaces get the person marker. */
const PINNED_AGENT_TITLE_RE = /\b(joey|zoe|skippy)\b/i;

// Done rows reclaim the leading status column: a quarter of the md icon box per density
// (16px desktop, 20px compact) stays behind so both text lines shift left together.
const DONE_STATUS_SPACER_WIDTH = { xs: 5, md: 4 };

export function SidebarWorkspaceRowFrame({
  workspace,
  isDragging = false,
  children,
}: {
  workspace: SidebarWorkspaceEntry;
  isDragging?: boolean;
  children: (input: {
    isHovered: boolean;
    contextMenuOpen: boolean;
    onContextMenuOpenChange: (open: boolean) => void;
    hoverHandlers: { onPointerEnter: () => void; onPointerLeave: () => void };
  }) => ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const handlePointerEnter = useCallback(() => {
    if (!contextMenuOpen) setIsHovered(true);
  }, [contextMenuOpen]);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    setContextMenuOpen(open);
    if (open) setIsHovered(false);
  }, []);
  const hoverHandlers = useMemo(
    () => ({ onPointerEnter: handlePointerEnter, onPointerLeave: handlePointerLeave }),
    [handlePointerEnter, handlePointerLeave],
  );

  return (
    <WorkspaceHoverCard
      workspace={workspace}
      prHint={workspace.prHint}
      isDragging={isDragging}
      disabled={contextMenuOpen}
    >
      {children({
        isHovered: isHovered && !contextMenuOpen && !isDragging,
        contextMenuOpen,
        onContextMenuOpenChange: handleContextMenuOpenChange,
        hoverHandlers,
      })}
    </WorkspaceHoverCard>
  );
}

export const SidebarWorkspaceRowContent = memo(function SidebarWorkspaceRowContent({
  workspace,
  hostBadge,
  leadingProjectName = null,
  leadingProjectIconDataUri = null,
  serviceSummary = null,
  backdrop,
  isHovered,
  isLoading,
  isCreating = false,
  shortcutNumber = null,
  showShortcutBadge = false,
  reserveIdleStatusIndicatorSpace = true,
  pinned = false,
  children,
}: {
  workspace: SidebarWorkspaceEntry;
  hostBadge?: HostBadgeModel | null;
  /** Hoisted rows use their project icon as the leading visual because no project row contains them. */
  leadingProjectName?: string | null;
  leadingProjectIconDataUri?: string | null;
  serviceSummary?: WorkspaceServiceSummary | null;
  /** The row's current background, so the project status badge can knock out of it. */
  backdrop: SidebarSurfaceBackdrop;
  isHovered: boolean;
  isLoading: boolean;
  isCreating?: boolean;
  shortcutNumber?: number | null;
  showShortcutBadge?: boolean;
  /** Keep the empty leading slot when the workspace has no active status. */
  reserveIdleStatusIndicatorSpace?: boolean;
  /** Pinned rows swap the leading status glyph for a pin marker and put their status on the meta line. */
  pinned?: boolean;
  children?: ReactNode;
}) {
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const workspaceLabel = resolveSidebarWorkspacePrimaryLabel({ workspace, workspaceTitleSource });
  // The workspace carries label names; their colors live in its host's catalog, so the row is
  // where the two meet — the meta line is handed finished definitions.
  const labels = useWorkspaceLabelDefinitions(workspace.serverId, workspace.labels);
  const workspaceBranchTextStyle = useMemo(
    () => [
      styles.workspaceBranchText,
      workspace.statusBucket === "failed" && styles.workspaceBranchTextFailed,
      workspace.statusBucket === "needs_input" && styles.workspaceBranchTextNeedsInput,
      workspace.statusBucket === "attention" && styles.workspaceBranchTextAttention,
      workspace.statusBucket === "running" && styles.workspaceBranchTextRunning,
      isHovered && styles.workspaceBranchTextHovered,
      isCreating && styles.workspaceBranchTextCreating,
    ],
    [workspace.statusBucket, isHovered, isCreating],
  );

  const isAgentPinned =
    pinned &&
    PINNED_AGENT_TITLE_RE.test(workspaceLabel) &&
    (workspace.labels?.includes("B") ?? false);

  const renderLeadingVisual = () => {
    if (pinned) {
      return (
        <View style={styles.workspaceStatusDot} testID="sidebar-pinned-kind-marker">
          {isAgentPinned ? (
            <ThemedUserRound size={PINNED_KIND_MARKER_SIZE} uniProps={pinnedMarkerColor} />
          ) : (
            <ThemedPin size={PINNED_KIND_MARKER_SIZE} uniProps={pinnedMarkerColor} />
          )}
        </View>
      );
    }
    // Active rows carry their status glyph whatever grouping put them there — hoisted under a
    // project or flat in a status group, the leading slot is the row's state, one glyph per
    // agent. Only done rows keep the project icon: no status to report, and the spec keeps
    // the repo icon on their reclaimed line.
    if (leadingProjectName && workspace.statusBucket === "done" && !isLoading) {
      return (
        <ProjectStatusIndicator
          iconDataUri={leadingProjectIconDataUri}
          displayName={leadingProjectName}
          projectViewKey={workspace.projectViewKey}
          statusBucket={workspace.statusBucket}
          backdrop={backdrop}
          loading={isLoading}
          testID={`sidebar-row-project-icon-${workspace.workspaceKey}`}
        />
      );
    }
    return (
      <WorkspaceStatusIndicator
        bucket={workspace.statusBucket}
        loading={isLoading}
        reserveIdleSpace={reserveIdleStatusIndicatorSpace}
      />
    );
  };

  return (
    <View style={styles.workspaceRowContent}>
      <View style={styles.workspaceRowMain}>
        {renderLeadingVisual()}
        <View style={styles.workspaceContentColumn}>
          <View style={styles.workspaceTitleRow}>
            <Text style={workspaceBranchTextStyle} numberOfLines={1}>
              {workspaceLabel}
            </Text>
            <View style={sidebarWorkspaceRowStyles.rowRight}>{children}</View>
          </View>
          {pinned ? (
            <View style={styles.pinnedMetaLine}>
              <PinnedStatusMarker bucket={workspace.statusBucket} loading={isLoading} />
              <WorkspaceMetaRow
                currentBranch={workspace.currentBranch}
                projectName={leadingProjectName}
                hostBadge={hostBadge ?? null}
                prHint={workspace.prHint}
                serviceSummary={serviceSummary}
                labels={labels}
              />
            </View>
          ) : (
            <WorkspaceMetaRow
              currentBranch={workspace.currentBranch}
              projectName={leadingProjectName}
              hostBadge={hostBadge ?? null}
              prHint={workspace.prHint}
              serviceSummary={serviceSummary}
              labels={labels}
            />
          )}
        </View>
      </View>
      {showShortcutBadge && shortcutNumber !== null ? (
        <View style={styles.shortcutBadgeOverlay} pointerEvents="none">
          <SidebarWorkspaceShortcutBadge number={shortcutNumber} />
        </View>
      ) : null}
    </View>
  );
});

function WorkspaceStatusIndicator({
  bucket,
  loading = false,
  reserveIdleSpace = true,
}: {
  bucket: SidebarWorkspaceEntry["statusBucket"];
  loading?: boolean;
  reserveIdleSpace?: boolean;
}) {
  // Busy is the only status that moves, and it is the ring rather than a glyph for the same
  // reason every status sits in this one slot: transient work has to fill it without
  // displacing anything.
  if (loading) {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-loading">
        <StatusRing />
      </View>
    );
  }

  // One glyph per bucket, vertically centred on the row, coloured by the same status-dot
  // band the rest of the sidebar reads, so a row and its data cannot disagree on state.
  switch (bucket) {
    case "failed":
      return (
        <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-failed">
          <ThemedCircleX size={STATUS_INDICATOR_GLYPH_SIZE} uniProps={failedStatusIconColor} />
        </View>
      );
    case "needs_input":
      return (
        <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-needs_input">
          <ThemedCircleQuestionMark
            size={STATUS_INDICATOR_GLYPH_SIZE}
            uniProps={needsInputStatusIconColor}
          />
        </View>
      );
    case "attention":
      return (
        <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-attention">
          <ThemedCircleCheck
            size={STATUS_INDICATOR_GLYPH_SIZE}
            uniProps={attentionStatusIconColor}
          />
        </View>
      );
    case "running":
      return (
        <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-running">
          <ThemedCirclePlay size={STATUS_INDICATOR_GLYPH_SIZE} uniProps={runningStatusIconColor} />
        </View>
      );
    case "done":
      // Done reports nothing, so the leading column gives most of its width back and both
      // text lines shift left together, staying aligned with each other.
      return reserveIdleSpace ? (
        <View style={styles.workspaceStatusDoneSpacer} testID="workspace-status-indicator-done" />
      ) : null;
  }
}

function PinnedStatusMarker({
  bucket,
  loading = false,
}: {
  bucket: SidebarWorkspaceEntry["statusBucket"];
  loading?: boolean;
}) {
  if (loading) return null;
  switch (bucket) {
    case "failed":
      return <ThemedCircleX size={PINNED_STATUS_MARKER_SIZE} uniProps={failedStatusIconColor} />;
    case "needs_input":
      return (
        <ThemedCircleQuestionMark
          size={PINNED_STATUS_MARKER_SIZE}
          uniProps={needsInputStatusIconColor}
        />
      );
    case "attention":
      return (
        <ThemedCircleCheck size={PINNED_STATUS_MARKER_SIZE} uniProps={attentionStatusIconColor} />
      );
    case "running":
      return (
        <ThemedCirclePlay size={PINNED_STATUS_MARKER_SIZE} uniProps={runningStatusIconColor} />
      );
    default:
      return null;
  }
}

export const sidebarWorkspaceRowStyles = StyleSheet.create((theme) => ({
  // How far a workspace row sits inside the group header above it — a project row or a
  // status group header. Both groupings share this one indent, so every grouped workspace row
  // in the sidebar sits on the same rail regardless of how the list is grouped. Pinned rows
  // are not grouped and stay flush.
  //
  // It is row padding rather than a margin on the list, because the row's hover and selected
  // backgrounds have to keep spanning the group's full width. Indenting the container instead
  // pulls the highlight in with the content and the row stops lining up with its header.
  rowIndented: {
    paddingLeft: theme.spacing[2] + theme.spacing[2],
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  shortcutBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.surface2,
    backgroundColor: theme.colors.surface0,
    flexShrink: 0,
  },
  shortcutBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 14,
  },
  hidden: { opacity: 0 },
  // Stays position:relative at zero width so the absolutely-positioned kebab keeps
  // anchoring to the same right edge whether or not the slot holds anything.
  trailingActionSlot: {
    position: "relative",
    minHeight: 20,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  trailingActionSlotReserved: {
    position: "relative",
    minWidth: 18,
    minHeight: 20,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  trailingActionOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
  },
}));

export function SidebarWorkspaceShortcutBadge({ number }: { number: number }) {
  return (
    <View style={sidebarWorkspaceRowStyles.shortcutBadge}>
      <Text style={sidebarWorkspaceRowStyles.shortcutBadgeText}>{number}</Text>
    </View>
  );
}

export type SidebarWorkspaceTrailingPresentation = "visible" | "hidden" | "absent";

/**
 * What the trailing slot shows for a row. Derived in one place because three row renderers
 * share it: the two project-mode rows and the status-mode row. The rule used to be copied
 * into each of them and immediately drifted — one call site kept hiding the diff after the
 * others stopped.
 *
 * The trailing content survives the kebab on hover and fades under the scrim instead of
 * blinking out. Touch has no hover, so its permanent kebab still hides the content outright
 * rather than scrimming an unhovered row whose background doesn't match the gradient.
 */
export function resolveTrailingActionVisibility({
  workspace,
  trailing,
  hasArchiveAction,
  isHovered,
  isTouchPlatform,
  showShortcut,
}: {
  workspace: SidebarWorkspaceEntry;
  trailing: SidebarWorkspaceTrailing;
  hasArchiveAction: boolean;
  isHovered: boolean;
  isTouchPlatform: boolean;
  showShortcut: boolean;
}): {
  trailingPresentation: SidebarWorkspaceTrailingPresentation;
  showKebab: boolean;
  showScrim: boolean;
  renderSlot: boolean;
  reserveSlotWidth: boolean;
} {
  const hasTrailing = hasSidebarWorkspaceTrailing({ workspace, trailing });
  const showKebab = Boolean(hasArchiveAction && (isHovered || isTouchPlatform)) && !showShortcut;
  // Touch permanently replaces the stats with the menu. Only temporary shortcut hints
  // conceal content while retaining its width, so desktop rows do not shift.
  const hasContent = hasTrailing && !(hasArchiveAction && isTouchPlatform);
  let trailingPresentation: SidebarWorkspaceTrailingPresentation = "absent";
  if (hasContent) trailingPresentation = showShortcut ? "hidden" : "visible";
  return {
    trailingPresentation,
    showKebab,
    // The scrim paints the row's own hover background, so it can only be drawn on a hovered
    // row — over an unhovered one the gradient fades to the wrong color. That is also why
    // touch, which shows the kebab without ever hovering, never gets one.
    showScrim: showKebab && isHovered,
    renderSlot: hasArchiveAction || hasTrailing,
    // The slot only holds width for something that permanently sits in it. Trailing content
    // does; the kebab only does on touch, where there is no hover for it to appear on and so
    // no scrim to let it overlay the title. Everywhere else the width goes back to the title
    // and the kebab fades in over its tail.
    reserveSlotWidth: hasContent || (hasArchiveAction && isTouchPlatform),
  };
}

export function SidebarWorkspaceTrailingActionSlot({
  reserveWidth,
  children,
}: {
  reserveWidth: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={
        reserveWidth
          ? sidebarWorkspaceRowStyles.trailingActionSlotReserved
          : sidebarWorkspaceRowStyles.trailingActionSlot
      }
    >
      {children}
    </View>
  );
}

export function SidebarWorkspaceTrailingActionBase({
  presentation,
  children,
}: {
  presentation: SidebarWorkspaceTrailingPresentation;
  children: ReactNode;
}) {
  if (presentation === "absent") return null;
  return (
    <View style={presentation === "hidden" ? sidebarWorkspaceRowStyles.hidden : undefined}>
      {children}
    </View>
  );
}

export function SidebarWorkspaceTrailingActionOverlay({
  visible,
  scrimBackdrop,
  children,
}: {
  visible: boolean;
  /** Fade the row into the kebab when something (the diff stat) is still rendered behind it. */
  scrimBackdrop?: SidebarSurfaceBackdrop;
  children: ReactNode;
}) {
  if (!visible || !children) return null;
  return (
    <>
      {scrimBackdrop ? (
        <TrailingActionScrim backdrop={scrimBackdrop} testID="sidebar-workspace-trailing-scrim" />
      ) : null}
      <View style={sidebarWorkspaceRowStyles.trailingActionOverlay}>{children}</View>
    </>
  );
}

// The status dot centres on the title's first line, so both share its line height.
const TITLE_LINE_HEIGHT = 20;

const styles = StyleSheet.create((theme) => ({
  workspaceRowContent: {
    position: "relative",
  },
  workspaceRowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    width: "100%",
  },
  workspaceContentColumn: {
    flex: 1,
    minWidth: 0,
  },
  workspaceTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  shortcutBadgeOverlay: {
    position: "absolute",
    top: 1,
    right: 0,
  },
  workspaceStatusDot: {
    position: "relative",
    width: densityIconBox("md"),
    height: TITLE_LINE_HEIGHT,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    // Vertically centred on the full two-line row, not the title line alone.
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  // Done rows report nothing: the leading column keeps a quarter of its width so both text
  // lines shift left together and stay aligned with each other.
  workspaceStatusDoneSpacer: {
    width: DONE_STATUS_SPACER_WIDTH,
    height: TITLE_LINE_HEIGHT,
    flexShrink: 0,
    alignSelf: "center",
  },
  // The pinned row's status marker sits at the start of the meta line, left of the machine
  // indicator, mirroring the pin glyph's column on the name line above it.
  pinnedMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // The title owns the first line outright now that the host, change request and CI moved
  // to the meta row, so it takes the full width the trailing slot leaves behind.
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: TITLE_LINE_HEIGHT,
    opacity: 0.76,
    flex: 1,
    minWidth: 0,
  },
  workspaceBranchTextCreating: {
    opacity: 0.92,
  },
  workspaceBranchTextHovered: {
    opacity: 1,
  },
  // Status colours carry the row's state onto the name itself; only the four states that
  // ask for attention colour it, done and unclassified keep the normal foreground.
  workspaceBranchTextFailed: {
    color: theme.colors.statusDotDanger,
    opacity: 1,
  },
  workspaceBranchTextNeedsInput: {
    color: theme.colors.statusDotWarning,
    opacity: 1,
  },
  workspaceBranchTextAttention: {
    color: theme.colors.statusDotSuccess,
    opacity: 1,
  },
  workspaceBranchTextRunning: {
    color: theme.colors.statusDotRunning,
    opacity: 1,
  },
}));
