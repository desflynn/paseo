// Vendor port: inline style arrays are render-time allocations, matching the vendored
// renderer's react-perf exemption.
// oxlint-disable react-perf/jsx-no-new-array-as-prop
// Full-screen image lightbox, adapted from packages/app/src/components/attachment-lightbox.tsx
// at v0.9.2. Plugin bundles get no safe-area module, so the top inset is one platform
// constant instead of real insets. No overlay layers, no window chrome regions.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { Theme } from "../styles/theme.ts";
import type { ViewportSize } from "./zoomable-viewport/geometry.ts";
import { ZoomableImage } from "./zoomable-viewport/image.tsx";

export interface ImageLightboxSource {
  uri: string;
  contentSize?: ViewportSize;
}

interface ImageLightboxProps {
  source: ImageLightboxSource | null;
  onClose: () => void;
  theme: Theme;
}

const LIGHTBOX_FIT = { padding: 16, maxWidth: 960, maxHeight: 640 };
const CLOSE_BUTTON_SIZE = 40;
const CLOSE_BUTTON_MARGIN = 8;
const WEB_TOOLBAR_INSET_RIGHT = CLOSE_BUTTON_SIZE + CLOSE_BUTTON_MARGIN * 2;

// Hardware knob: no safe-area module in plugin bundles. Android reads the status bar,
// iOS uses the notch-era status bar height, web needs nothing.
const TOP_INSET =
  Platform.select({ android: StatusBar.currentHeight ?? 24, ios: 44, default: 0 }) ?? 0;

export function ImageLightbox({ source, onClose, theme }: ImageLightboxProps) {
  const [errored, setErrored] = useState(false);
  const uriKey = source?.uri;

  useEffect(() => {
    setErrored(false);
  }, [uriKey]);

  const handleError = useCallback(() => setErrored(true), []);
  const closeButtonStyle = useMemo<ViewStyle>(
    () => ({
      ...styles.closeButton,
      top: TOP_INSET + CLOSE_BUTTON_MARGIN,
      backgroundColor: theme.colors.surface2,
    }),
    [theme.colors.surface2],
  );

  if (!source) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close image"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
          testID="plugin-image-lightbox-backdrop"
        />
        <View pointerEvents="box-none" style={styles.contentLayer}>
          <View pointerEvents="box-none" style={styles.imageArea}>
            {errored ? (
              <Text style={[errorTextStyle, { color: theme.colors.foregroundMuted }]}>
                Image failed to load
              </Text>
            ) : (
              <ZoomableImage
                accessibilityLabel="Image"
                contentSize={source.contentSize}
                uri={source.uri}
                fit={LIGHTBOX_FIT}
                onError={handleError}
                onPressOutsideContent={onClose}
                style={styles.imageViewport}
                testID="plugin-image-lightbox"
                theme={theme}
                toolbarInsetRight={WEB_TOOLBAR_INSET_RIGHT}
              />
            )}
          </View>
        </View>
        <Pressable
          accessibilityLabel="Close image"
          accessibilityRole="button"
          onPress={onClose}
          style={closeButtonStyle}
          testID="plugin-image-lightbox-close"
        >
          <Icon name="X" size={18} color={theme.colors.foreground} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles: Record<string, ViewStyle> = {
  root: { flex: 1, minHeight: 0, minWidth: 0 },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  contentLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  imageArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  imageViewport: { flex: 1, width: "100%", alignSelf: "center" },
  closeButton: {
    position: "absolute",
    right: CLOSE_BUTTON_MARGIN,
    width: CLOSE_BUTTON_SIZE,
    height: CLOSE_BUTTON_SIZE,
    borderRadius: CLOSE_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
};

const errorTextStyle: TextStyle = { fontSize: 14 };
