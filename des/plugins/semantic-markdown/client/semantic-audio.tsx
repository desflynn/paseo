// Inline audio pill for semantic_audio. The bytes arrive once per path through
// the read-audio RPC (module Map cache). Web plays a blob: URL on a plain
// <audio> element; native wraps a data: URI in the mermaid preview's
// RNCWebView — a dark page whose only content is <audio controls autoplay>.
// Every prop of the memoised NativeWebView stays stable after mount (see
// native-webview.tsx): the source is built once per result, the rest are
// module constants.
// Render-time style objects: same rationale as semantic-markdown.tsx.
// oxlint-disable react-perf/jsx-no-new-object-as-prop
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { NativeWebView } from "./vendor/components/markdown/fence/mermaid/native-webview.tsx";
import { isWeb } from "./vendor/constants/platform.ts";
import type { Theme } from "./vendor/styles/theme.ts";
import { readAudioRpc, type ReadAudioResult } from "../shared/read-audio.ts";

// Same fill/radius language as the {status} strip in semantic-markdown.tsx;
// kept local because importing that file from here would be a cycle.
const PILL_BACKGROUND = "rgba(147, 197, 253, 0.1)";
const PILL_ICON = "#93c5fd";

const IS_ANDROID = Platform.OS === "android";
const ORIGIN_WHITELIST = ["*"];

/** Fallback when the read fails: open the file like a plain path link. */
export const AudioOpenFileContext = createContext<(path: string) => void>(() => {});

// One fetch per path for the whole session: the same file can appear in
// several messages and streaming re-renders remount pills. A failed RPC is
// cached as an error result, never as a rejected promise.
const audioCache = new Map<string, Promise<ReadAudioResult>>();

function loadAudio(
  path: string,
  invoke: (input: { path: string }) => Promise<ReadAudioResult>,
): Promise<ReadAudioResult> {
  let cached = audioCache.get(path);
  if (!cached) {
    cached = invoke({ path }).catch(
      (error: unknown): ReadAudioResult => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    audioCache.set(path, cached);
  }
  return cached;
}

function audioPageSource(mime: string, base64: string): { html: string; baseUrl?: string } {
  // Minimal dark page; nothing loads remotely — the source is inline data.
  // Android needs a baseUrl to load html strings (mermaid native-host.tsx:68).
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<style>html,body{margin:0;height:100%;background:#0b0f14;overflow:hidden}" +
    "audio{width:100%}</style></head><body>" +
    `<audio controls autoplay style="width:100%" src="data:${mime};base64,${base64}">` +
    "</audio></body></html>";
  return IS_ANDROID ? { html, baseUrl: "https://paseo-plugin.invalid/" } : { html };
}

export function SemanticAudio({
  path,
  label,
  theme,
}: {
  path: string;
  label: string;
  theme: Theme;
}) {
  const invoke = useRpc(readAudioRpc);
  const openFile = useContext(AudioOpenFileContext);
  const [result, setResult] = useState<ReadAudioResult | null>(null);
  const [loading, setLoading] = useState(false);

  // First tap fetches and plays; after a failed read, taps open the file instead.
  const onPress = useCallback(async () => {
    if (result && !result.ok) return openFile(path);
    if (result || loading) return;
    setLoading(true);
    setResult(await loadAudio(path, invoke));
    setLoading(false);
  }, [result, loading, path, invoke, openFile]);

  // Web: blob: URL from the decoded bytes, revoked when it changes or unmounts.
  const blobUrl = useMemo(() => {
    if (!isWeb || !result?.ok) return null;
    const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: result.mime }));
  }, [result]);
  useEffect(() => {
    if (!blobUrl) return;
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  // Native: built once per result so the memoised WebView never reloads.
  const nativeSource = useMemo(
    () => (isWeb || !result?.ok ? null : audioPageSource(result.mime, result.base64)),
    [result],
  );

  const failed = result !== null && !result.ok;
  const title = label || path.split("/").pop() || path;

  return (
    <View
      style={{
        borderRadius: theme.borderRadius.md,
        overflow: "hidden",
        backgroundColor: PILL_BACKGROUND,
        marginBottom: theme.spacing[1],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={failed ? `Open ${title}` : `Play audio ${title}`}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[2],
          paddingHorizontal: theme.spacing[3],
          paddingVertical: 10,
        }}
      >
        <Icon name="Play" size={16} color={PILL_ICON} />
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.foreground,
            fontSize: theme.fontSize.base,
            lineHeight: 20,
            flexShrink: 1,
          }}
        >
          {title}
        </Text>
      </Pressable>
      {failed && result && !result.ok ? (
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.foreground,
            fontSize: theme.fontSize.base,
            lineHeight: 20,
            opacity: 0.66,
            paddingHorizontal: theme.spacing[3],
            paddingBottom: 10,
          }}
        >
          {result.error}
        </Text>
      ) : null}
      {isWeb && blobUrl
        ? createElement("audio", {
            controls: true,
            autoPlay: true,
            src: blobUrl,
            style: { width: "100%" },
          })
        : null}
      {!isWeb && nativeSource ? (
        <View style={{ height: 60 }}>
          <NativeWebView
            newSource={nativeSource}
            originWhitelist={ORIGIN_WHITELIST}
            javaScriptEnabled
            messagingEnabled={!IS_ANDROID}
            messagingModuleName=""
            scrollEnabled={false}
            bounces={false}
            mediaPlaybackRequiresUserAction={false}
            style={{ flex: 1, backgroundColor: "transparent" }}
          />
        </View>
      ) : null}
    </View>
  );
}
