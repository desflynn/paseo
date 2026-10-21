import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { buildPaseoToolDetailSections } from "@getpaseo/protocol/paseo-tool-call-detail";
import {
  inspectResult,
  keyedItems,
  nativeUnknownSections,
  rawText,
  unwrapResult,
  type ResultView,
} from "../shared/results";

export interface ToolResultProps {
  name: string;
  input: unknown;
  output: unknown;
  source?: unknown;
  theme: PluginTheme;
  compact: boolean;
}

type Styles = ReturnType<typeof useStyles>;
function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () => ({
      root: { gap: 12 },
      tabs: { flexDirection: "row" as const, gap: 16, padding: 12 },
      text: { color: theme.colors.foreground, fontSize: 14, lineHeight: 21 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 21 },
      active: { color: theme.colors.accent, fontSize: 14, fontWeight: "600" as const },
      section: {
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      heading: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
      nativeRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 16 },
      nativeLabel: {
        width: 120,
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        lineHeight: 21,
      },
      nativeValue: {
        flex: 1,
        minWidth: 0,
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 21,
      },
      raw: { maxHeight: 300 },
      code: { color: theme.colors.foreground, fontFamily: "monospace", fontSize: 12, padding: 12 },
      record: {
        gap: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
      },
      field: { gap: 4, flexDirection: compact ? ("column" as const) : ("row" as const) },
      label: { color: theme.colors.foregroundMuted, fontSize: 12, minWidth: compact ? 0 : 120 },
      row: {
        flexDirection: "row" as const,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      cell: { width: 160, padding: 10, color: theme.colors.foreground, fontSize: 14 },
      tableHeader: { flexDirection: "row" as const, backgroundColor: theme.colors.surface1 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 14 },
    }),
    [theme, compact],
  );
}

function Raw({ value, styles }: { value: unknown; styles: Styles }) {
  return (
    <ScrollView horizontal nestedScrollEnabled style={styles.raw}>
      <Text selectable style={styles.code}>
        {rawText(value)}
      </Text>
    </ScrollView>
  );
}

// Same field builder, section order and raw serialization as Paseo's unknown-detail path.
export function NativeDetails({ name, input, output, theme, compact }: ToolResultProps) {
  const styles = useStyles(theme, compact);
  const sections = buildPaseoToolDetailSections(name, input, output);
  if (sections)
    return (
      <View style={styles.root}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.heading}>{section.title}</Text>
            {section.kind === "prose" ? (
              <Text selectable style={styles.text}>
                {section.text}
              </Text>
            ) : (
              section.fields.map((field) => (
                <View key={field.label} style={styles.nativeRow}>
                  <Text style={styles.nativeLabel}>{field.label}</Text>
                  <Text selectable style={styles.nativeValue}>
                    {field.value}
                  </Text>
                </View>
              ))
            )}
          </View>
        ))}
      </View>
    );
  return (
    <View style={styles.root}>
      {nativeUnknownSections(input, output).map((section) => (
        <View key={section.title} style={styles.section}>
          {section.title ? <Text style={styles.heading}>{section.title}</Text> : null}
          {section.title ? (
            <Raw value={section.value} styles={styles} />
          ) : (
            <Text selectable style={styles.text}>
              {String(section.value)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function cellText(value: unknown): string {
  return value === undefined ? "" : rawText(value);
}

function InspectedValue({
  value,
  styles,
  compact,
}: {
  value: unknown;
  styles: Styles;
  compact: boolean;
}) {
  return <ResultViewNode model={inspectResult(value)} styles={styles} compact={compact} />;
}

function ResultViewNode({
  model,
  styles,
  compact,
}: {
  model: ResultView;
  styles: Styles;
  compact: boolean;
}) {
  switch (model.kind) {
    case "annotated":
      return (
        <View style={styles.root}>
          <Text style={styles.muted} selectable numberOfLines={compact ? 1 : undefined}>
            {model.prose}
          </Text>
          <ResultViewNode model={model.view} styles={styles} compact={compact} />
        </View>
      );
    case "text":
      return (
        <Text selectable style={styles.text}>
          {model.text}
        </Text>
      );
    case "scalar":
      return (
        <Text selectable style={styles.text}>
          {rawText(model.value)}
        </Text>
      );
    case "record":
      return (
        <View style={styles.record}>
          {model.fields.map(([key, child]) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{key}</Text>
              <InspectedValue value={child} styles={styles} compact={compact} />
            </View>
          ))}
        </View>
      );
    case "list":
      return model.items.length ? (
        <View style={styles.root}>
          {keyedItems(model.items).map(({ key, value: item }, index) => (
            <View key={key} style={styles.record}>
              <Text style={styles.muted}>Item {index + 1}</Text>
              <InspectedValue value={item} styles={styles} compact={compact} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Empty list</Text>
      );
    case "table":
      if (compact)
        return (
          <View style={styles.root}>
            {keyedItems(model.rows).map(({ key, value: row }) => (
              <View key={key} style={styles.record}>
                {model.columns.map((column) => (
                  <View key={column} style={styles.field}>
                    <Text style={styles.label}>{column}</Text>
                    <Text selectable style={styles.text}>
                      {cellText(row[column])}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      return (
        <ScrollView horizontal nestedScrollEnabled>
          <View>
            <View style={styles.tableHeader}>
              {model.columns.map((column) => (
                <Text key={column} style={styles.cell}>
                  {column}
                </Text>
              ))}
            </View>
            {keyedItems(model.rows).map(({ key, value: row }) => (
              <View key={key} style={styles.row}>
                {model.columns.map((column) => (
                  <Text selectable key={column} style={styles.cell}>
                    {cellText(row[column])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
  }
}

export function ToolResultView(props: ToolResultProps) {
  const [mode, setMode] = useState<"native" | "inspect" | "raw">("inspect");
  const styles = useStyles(props.theme, props.compact);
  const showNative = useCallback(() => setMode("native"), []);
  const showInspect = useCallback(() => setMode("inspect"), []);
  const showRaw = useCallback(() => setMode("raw"), []);
  let content: ReactNode;
  switch (mode) {
    case "native":
      content = <NativeDetails {...props} />;
      break;
    case "raw":
      content = <Raw value={props.source ?? props.output} styles={styles} />;
      break;
    case "inspect":
      content = (
        <View style={styles.section}>
          <InspectedValue
            value={unwrapResult(props.output)}
            styles={styles}
            compact={props.compact}
          />
        </View>
      );
      break;
  }
  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="button" onPress={showInspect}>
          <Text style={mode === "inspect" ? styles.active : styles.text}>Inspect</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={showNative}>
          <Text style={mode === "native" ? styles.active : styles.text}>Native</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={showRaw}>
          <Text style={mode === "raw" ? styles.active : styles.text}>Raw</Text>
        </Pressable>
      </View>
      {content}
    </View>
  );
}
