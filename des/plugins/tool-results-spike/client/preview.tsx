import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ToolResultView } from "./result-view";

const examples = [
  {
    label: "Agents",
    name: "paseo.list_agents",
    input: { limit: 2 },
    output: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            agents: [
              { title: "Build agent", status: "running", provider: "pi" },
              { title: "Review agent", status: "idle", provider: "claude" },
            ],
          }),
        },
      ],
    },
  },
  {
    label: "Wiki",
    name: "dci.wiki_search",
    input: { query: "renderer" },
    output: {
      structuredContent: {
        matchCount: 2,
        results: [
          {
            page: "plugins.md",
            title: "Plugins",
            snippet: "Cross-platform timeline contributions.",
          },
          {
            page: "tools.md",
            title: "Tools",
            snippet: "Keep raw results available for inspection.",
          },
        ],
      },
    },
  },
  {
    label: "Text",
    name: "example.explain",
    input: { subject: "tools" },
    output: {
      content: [
        {
          type: "text",
          text: "First paragraph.\n\nSecond paragraph.\nThe original line breaks remain intact.",
        },
      ],
    },
  },
];

export function Preview({ theme, layout }: PluginSurfaceProps) {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  const selectAgents = useCallback(() => setSelected(0), []);
  const selectWiki = useCallback(() => setSelected(1), []);
  const selectText = useCallback(() => setSelected(2), []);
  const styles = useMemo(
    () => ({
      root: { padding: layout.compact ? 12 : 24, gap: 16 },
      heading: { color: theme.colors.foreground, fontSize: 20, fontWeight: "600" as const },
      description: { color: theme.colors.foregroundMuted, fontSize: 14 },
      choices: { flexDirection: "row" as const, gap: 16 },
      selected: { color: theme.colors.accent, fontSize: 14 },
      choice: { color: theme.colors.foreground, fontSize: 14 },
      source: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme, layout.compact],
  );
  return (
    <ScrollView>
      <View style={styles.root}>
        <Text style={styles.heading}>Tool results spike</Text>
        <Text style={styles.description}>
          Fixture preview only. Existing chat tool rows remain untouched.
        </Text>
        <View style={styles.choices}>
          <Pressable accessibilityRole="button" onPress={selectAgents}>
            <Text style={selected === 0 ? styles.selected : styles.choice}>Agents</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={selectWiki}>
            <Text style={selected === 1 ? styles.selected : styles.choice}>Wiki</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={selectText}>
            <Text style={selected === 2 ? styles.selected : styles.choice}>Text</Text>
          </Pressable>
        </View>
        <Text style={styles.source}>{example.name}</Text>
        <ToolResultView
          key={example.name}
          name={example.name}
          input={example.input}
          output={example.output}
          theme={theme}
          compact={layout.compact}
        />
      </View>
    </ScrollView>
  );
}
