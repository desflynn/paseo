// Port of packages/app/src/components/zoomable-viewport/image.tsx at v0.9.2.
// unistyles StyleSheet -> plain style objects; everything else is unchanged.
import { useEffect, useMemo, useState } from "react";
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import type { Theme } from "../../styles/theme.ts";
import type { ViewportFitOptions, ViewportSize } from "./geometry.ts";
import { ZoomableViewport } from "./index.tsx";

interface ZoomableImageProps {
  uri: string;
  accessibilityLabel?: string;
  contentSize?: ViewportSize;
  fit?: ViewportFitOptions;
  maxScale?: number;
  minScale?: number;
  onError?: () => void;
  onPressOutsideContent?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  theme: Theme;
  toolbarInsetRight?: number;
  wheelActivation?: "always" | "modifier";
}

export function ZoomableImage({
  uri,
  accessibilityLabel,
  contentSize,
  fit,
  maxScale,
  minScale = 1,
  onError,
  onPressOutsideContent,
  style,
  testID = "zoomable-image",
  theme,
  toolbarInsetRight,
  wheelActivation = "always",
}: ZoomableImageProps) {
  const [loadedSize, setLoadedSize] = useState<ViewportSize | null>(null);
  const resolvedSize = contentSize ?? loadedSize;
  const source = useMemo(() => ({ uri }), [uri]);

  useEffect(() => {
    if (contentSize) return;
    let active = true;
    setLoadedSize(null);
    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) setLoadedSize({ width, height });
      },
      () => {
        if (active) onError?.();
      },
    );
    return () => {
      active = false;
    };
  }, [contentSize, onError, uri]);

  if (!resolvedSize) {
    return (
      <View style={style} testID={testID}>
        <Image
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          onError={onError}
          resizeMode="contain"
          source={source}
          style={imageFillStyle}
          testID={`${testID}-image`}
        />
      </View>
    );
  }

  return (
    <ZoomableViewport
      accessibilityLabel={accessibilityLabel}
      contentSize={resolvedSize}
      fit={fit}
      maxScale={maxScale}
      minScale={minScale}
      onPressOutsideContent={onPressOutsideContent}
      style={style}
      testID={testID}
      theme={theme}
      toolbarInsetRight={toolbarInsetRight}
      wheelActivation={wheelActivation}
    >
      <Image
        onError={onError}
        resizeMode="contain"
        source={source}
        style={imageFillStyle}
        testID={`${testID}-image`}
      />
    </ZoomableViewport>
  );
}

const imageFillStyle: ImageStyle = { width: "100%", height: "100%" };
