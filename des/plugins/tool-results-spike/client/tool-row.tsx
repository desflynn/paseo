import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { ToolResultView } from "./result-view";
import { useToolGroups } from "./use-tool-groups";
import { useToolCallGroupingPreference } from "./grouping-preference";
import { buildToolRowPresentation } from "../shared/presentation";
import type { ToolCallGroup } from "../shared/grouping";
import {
  sourceItemFromData,
  toolRowDataSchema,
  transformToolCallItem,
  type ToolRowData,
} from "../shared/tool-call";

type RowProps = PluginTimelineItemProps<ToolRowData>;

function useStyles(theme: PluginTheme, compact: boolean) {
  return {
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingVertical: 6,
    },
    label: {
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: "600" as const,
      flexShrink: 1,
    },
    summary: { color: theme.colors.foregroundMuted, fontSize: 12, flexShrink: 1 },
    errorText: { color: theme.colors.statusDanger, fontSize: 12 },
    statusText: { color: theme.colors.foregroundMuted, fontSize: 12 },
    body: { paddingLeft: compact ? 0 : 24, paddingBottom: 8 },
    detailBody: { maxHeight: 360 },
    groupBody: { paddingLeft: compact ? 0 : 16, gap: 8 },
  };
}

function StatusLine({ data, styles }: { data: ToolRowData; styles: ReturnType<typeof useStyles> }) {
  if (data.status === "failed") {
    return (
      <Text style={styles.errorText} selectable>
        {data.errorText ?? data.name}
      </Text>
    );
  }
  if (data.status === "canceled") return <Text style={styles.statusText}>Canceled</Text>;
  if (data.status === "running") return <Text style={styles.statusText}>Running…</Text>;
  return null;
}

function IndividualToolCallRow({ item, theme, layout }: RowProps) {
  const data = item.data;
  const presentation = useMemo(() => buildToolRowPresentation(data), [data]);
  const compact = layout.compact;
  const styles = useStyles(theme, compact);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const openDetails = useCallback(() => setDetailsOpen(true), []);
  const toggleDetails = useCallback(() => setDetailsOpen((open) => !open), []);
  const accessibilityState = useMemo(() => ({ expanded: detailsOpen }), [detailsOpen]);
  const header = (
    <View style={styles.header}>
      {data.status === "running" ? (
        <ActivityIndicator size="small" color={theme.colors.accent} />
      ) : (
        <Icon
          name={presentation.iconName}
          size={16}
          color={
            data.status === "failed" ? theme.colors.statusDanger : theme.colors.foregroundMuted
          }
        />
      )}
      <Text style={styles.label} numberOfLines={1}>
        {presentation.displayName}
      </Text>
      {presentation.summary ? (
        <Text style={styles.summary} numberOfLines={1}>
          {presentation.summary}
        </Text>
      ) : null}
      {data.status === "canceled" ? (
        <Icon name="Ban" size={12} color={theme.colors.statusWarning} />
      ) : null}
    </View>
  );
  const result = (
    <ScrollView nestedScrollEnabled style={styles.detailBody}>
      {presentation.isLoadingDetails ? (
        <Text style={styles.statusText}>Waiting for tool details…</Text>
      ) : null}
      <ToolResultView
        name={data.name}
        input={data.input}
        output={data.output}
        source={data.source}
        theme={theme}
        compact={compact}
      />
    </ScrollView>
  );
  // Raw source remains inspectable even when the native meaningful-detail
  // predicate is false (for example a completed call with null output).
  if (compact) {
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={presentation.displayName}
          onPress={openDetails}
        >
          {header}
        </Pressable>
        <View style={styles.body}>
          <StatusLine data={data} styles={styles} />
        </View>
        <Modal title={presentation.displayName} open={detailsOpen} onOpenChange={setDetailsOpen}>
          <Modal.Content scrollable={false}>
            <StatusLine data={data} styles={styles} />
            {result}
          </Modal.Content>
        </Modal>
      </View>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={presentation.displayName}
        accessibilityState={accessibilityState}
        onPress={toggleDetails}
      >
        {header}
      </Pressable>
      <View style={styles.body}>
        <StatusLine data={data} styles={styles} />
      </View>
      {detailsOpen ? <View style={styles.body}>{result}</View> : null}
    </View>
  );
}

// Same count order and English join mechanics as the upstream overview view.
// The plugin does not import the app's private i18n/provider context.
function groupLabel(group: ToolCallGroup): string {
  const s = group.summary;
  const counts = [
    [s.editedFileCount, "edited", "file", "files"],
    [s.commandCount, "ran", "command", "commands"],
    [s.readFileCount, "read", "file", "files"],
    [s.searchCount, "searched", "time", "times"],
    [s.otherToolCount, "used", "other tool", "other tools"],
    [s.paseoCallCount, "called Paseo", "time", "times"],
  ] as const;
  const parts = counts
    .filter(([count]) => count > 0)
    .map(([count, verb, one, many]) => `${verb} ${count} ${count === 1 ? one : many}`);
  const label =
    parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return label ? label[0].toUpperCase() + label.slice(1) : `${group.calls.length} tool calls`;
}

function GroupedToolCallRows({ group, props }: { group: ToolCallGroup; props: RowProps }) {
  const { theme, layout } = props;
  const styles = useStyles(theme, layout.compact);
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((open) => !open), []);
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const label = groupLabel(group);
  const rows = useMemo(
    () =>
      group.calls.flatMap((source) => {
        const transformed = transformToolCallItem(source)?.items[0];
        if (!transformed) return [];
        return [{ ...props.item, ...transformed, data: toolRowDataSchema.parse(transformed.data) }];
      }),
    [group.calls, props.item],
  );
  const details = (
    <View style={styles.groupBody}>
      {rows.map((item) => (
        <IndividualToolCallRow key={item.data.callId} {...props} item={item} />
      ))}
    </View>
  );
  let detailPanel = expanded ? details : null;
  if (layout.compact) {
    detailPanel = (
      <Modal title={label} open={expanded} onOpenChange={setExpanded}>
        <Modal.Content>{details}</Modal.Content>
      </Modal>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
        onPress={toggleExpanded}
      >
        <View style={styles.header}>
          {group.isLoading ? (
            <ActivityIndicator
              accessibilityLabel="Running tool calls"
              size="small"
              color={theme.colors.accent}
            />
          ) : (
            <Icon name="Wrench" size={16} color={theme.colors.foregroundMuted} />
          )}
          <Text style={styles.label}>{label}</Text>
          {group.failedCount > 0 ? (
            <Text style={styles.errorText}>{group.failedCount} failed</Text>
          ) : null}
          {group.canceledCount > 0 ? (
            <Text style={styles.statusText}>{group.canceledCount} canceled</Text>
          ) : null}
          <Icon
            name={expanded ? "ChevronUp" : "ChevronDown"}
            size={14}
            color={theme.colors.foregroundMuted}
          />
        </View>
      </Pressable>
      {detailPanel}
    </View>
  );
}

export function ToolCallRow(props: RowProps) {
  const groupingEnabled = useToolCallGroupingPreference();
  const source = useMemo(() => sourceItemFromData(props.item.data), [props.item.data]);
  const { group, isHost } = useToolGroups(props.agentId, source, props.host.id, groupingEnabled);
  if (!groupingEnabled || !group || group.calls.length < 2)
    return <IndividualToolCallRow {...props} />;
  if (!isHost) return null;
  return <GroupedToolCallRows key={group.id} group={group} props={props} />;
}
