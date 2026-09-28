// Each card shows the build stamp so a stale bundle on the phone is obvious. With
// PLUGIN_DEBUG a render failure shows its message and stack in red; without it the card
// falls back to the original message text, so a crash never hides the message.
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";

// Debug cards: inline style objects are per-render on purpose (they read the live
// theme), so suppress the allocation lint rather than hoisting a stale theme.
// oxlint-disable react-perf/jsx-no-new-object-as-prop

declare const __PLUGIN_BUILD__: string;
// Render failures stay visible instead of silently reverting to plain text.
// Keep in step with index.client.tsx.
export const PLUGIN_DEBUG = true;
export const PLUGIN_BUILD = typeof __PLUGIN_BUILD__ === "string" ? __PLUGIN_BUILD__ : "dev";

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${String(error.stack ?? "")
      .split("\n")
      .slice(0, 14)
      .join("\n")}`;
  }
  return String(error);
}

interface BoundaryProps {
  danger: string;
  muted: string;
  fallbackText: string;
  children: ReactNode;
}

interface BoundaryState {
  error: string | null;
}

class RenderBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: describeError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn("[semantic-markdown] render failed", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error && !PLUGIN_DEBUG) {
      return (
        <Text selectable style={{ color: this.props.muted }}>
          {this.props.fallbackText}
        </Text>
      );
    }
    if (this.state.error) {
      return (
        <Text selectable style={{ color: this.props.danger, fontSize: 12 }}>
          semantic-markdown render FAILED (build {PLUGIN_BUILD}):{"\n"}
          {this.state.error}
        </Text>
      );
    }
    return this.props.children;
  }
}

export function withDebug<Data>(
  Inner: ComponentType<PluginTimelineItemProps<Data>>,
): ComponentType<PluginTimelineItemProps<Data>> {
  return function DebugWrapped(props: PluginTimelineItemProps<Data>) {
    const { colors } = props.theme;
    return (
      <View>
        <RenderBoundary
          danger={colors.statusDanger}
          muted={colors.foreground}
          fallbackText={String((props.item.data as { text?: unknown }).text ?? "")}
        >
          <Inner {...props} />
        </RenderBoundary>
        <Text selectable style={{ color: colors.foregroundMuted, fontSize: 10, opacity: 0.6 }}>
          semantic-markdown build {PLUGIN_BUILD}
        </Text>
      </View>
    );
  };
}
