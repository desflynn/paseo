// Vendor port: inline style arrays are render-time allocations, matching the vendored
// renderer's react-perf exemption.
// oxlint-disable react-perf/jsx-no-new-array-as-prop
// Native viewport: core react-native Animated + PanResponder only. Plugin bundles
// cannot use react-native-gesture-handler or reanimated (VENDOR_PLAN risk 1/6).
// Pinch zooms 1x-5x, one finger pans while zoomed, double tap toggles zoom,
// a tap outside the image closes, and the transform resets on content change.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import {
  FIT_TRANSFORM,
  fitContentSize,
  isPointInsideTransformedContent,
  panContent,
  zoomContentAtPoint,
  type ViewportPoint,
  type ViewportSize,
  type ViewportTransform,
} from "./geometry.ts";
import type { ZoomableViewportProps } from "./types.ts";

const DEFAULT_MIN_SCALE = 1;
const DEFAULT_MAX_SCALE = 5;
const DOUBLE_TAP_MAX_MS = 300;
const DOUBLE_TAP_SCALE = 2;

// Touch locationX/Y is relative to the touched view, which is the scaled image, so
// the pinch distance never changed. Page coordinates minus the root's window origin
// give points in stable viewport space.
function viewportPoint(
  touch: { pageX: number; pageY: number },
  origin: ViewportPoint,
): ViewportPoint {
  return { x: touch.pageX - origin.x, y: touch.pageY - origin.y };
}

interface GestureState {
  pinching: boolean;
  moved: boolean;
  startDistance: number;
  startMidpoint: ViewportPoint;
  startTransform: ViewportTransform;
  lastPoint: ViewportPoint | null;
  lastTapAt: number;
}

export function ZoomableViewportNative({
  contentSize,
  children,
  accessibilityLabel,
  fit,
  maxScale = DEFAULT_MAX_SCALE,
  minScale = DEFAULT_MIN_SCALE,
  onPressOutsideContent,
  style,
  testID,
}: ZoomableViewportProps) {
  const [viewport, setViewport] = useState<ViewportSize | null>(null);
  const transformRef = useRef<ViewportTransform>(FIT_TRANSFORM);
  const rootRef = useRef<View>(null);
  const originRef = useRef<ViewportPoint>({ x: 0, y: 0 });
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const gesture = useRef<GestureState>({
    pinching: false,
    moved: false,
    startDistance: 0,
    startMidpoint: { x: 0, y: 0 },
    startTransform: FIT_TRANSFORM,
    lastPoint: null,
    lastTapAt: 0,
  }).current;
  const fittedContent = useMemo(
    () => (viewport ? fitContentSize(contentSize, viewport, fit) : null),
    [contentSize, fit, viewport],
  );
  const limits = useMemo(() => ({ minScale, maxScale }), [maxScale, minScale]);

  const commit = useCallback(
    (next: ViewportTransform) => {
      transformRef.current = next;
      scale.setValue(next.scale);
      translateX.setValue(next.x);
      translateY.setValue(next.y);
    },
    [scale, translateX, translateY],
  );
  const reset = useCallback(() => commit(FIT_TRANSFORM), [commit]);

  useEffect(() => reset(), [contentSize.height, contentSize.width, reset, viewport]);

  const handlePinchMove = useCallback(
    (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      if (touches.length < 2 || !fittedContent || !viewport) return;
      const first = viewportPoint(touches[0], originRef.current);
      const second = viewportPoint(touches[1], originRef.current);
      const pinchMidpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
      if (!gesture.pinching) {
        gesture.pinching = true;
        gesture.moved = true;
        gesture.startDistance = pinchDistance;
        gesture.startMidpoint = pinchMidpoint;
        gesture.startTransform = transformRef.current;
        return;
      }
      if (gesture.startDistance <= 0) return;
      const panned = panContent({
        transform: gesture.startTransform,
        delta: {
          x: pinchMidpoint.x - gesture.startMidpoint.x,
          y: pinchMidpoint.y - gesture.startMidpoint.y,
        },
        fittedContent,
        viewport,
        limits,
      });
      commit(
        zoomContentAtPoint({
          transform: panned,
          scale: panned.scale * (pinchDistance / gesture.startDistance),
          focalPoint: pinchMidpoint,
          fittedContent,
          viewport,
          limits,
        }),
      );
    },
    [commit, fittedContent, gesture, limits, viewport],
  );

  const handlePanMove = useCallback(
    (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        handlePinchMove(event);
        return;
      }
      if (!fittedContent || !viewport || touches.length === 0) return;
      const point = viewportPoint(touches[0], originRef.current);
      if (gesture.pinching) {
        gesture.pinching = false;
        gesture.lastPoint = point;
        return;
      }
      const previous = gesture.lastPoint;
      gesture.lastPoint = point;
      if (!previous) return;
      const delta = { x: point.x - previous.x, y: point.y - previous.y };
      if (Math.hypot(delta.x, delta.y) > 1) gesture.moved = true;
      commit(
        panContent({ transform: transformRef.current, delta, fittedContent, viewport, limits }),
      );
    },
    [commit, fittedContent, gesture, handlePinchMove, limits, viewport],
  );

  const handleRelease = useCallback(
    (event: GestureResponderEvent) => {
      const wasPinching = gesture.pinching;
      const wasMoved = gesture.moved;
      gesture.pinching = false;
      gesture.moved = false;
      gesture.lastPoint = null;
      if (wasPinching || wasMoved || !fittedContent || !viewport) return;
      const point = viewportPoint(event.nativeEvent, originRef.current);
      const now = Date.now();
      if (now - gesture.lastTapAt < DOUBLE_TAP_MAX_MS) {
        gesture.lastTapAt = 0;
        if (transformRef.current.scale > minScale) {
          reset();
          return;
        }
        commit(
          zoomContentAtPoint({
            transform: transformRef.current,
            scale: Math.min(maxScale, DOUBLE_TAP_SCALE),
            focalPoint: point,
            fittedContent,
            viewport,
            limits,
          }),
        );
        return;
      }
      gesture.lastTapAt = now;
      if (
        !isPointInsideTransformedContent({
          point,
          transform: transformRef.current,
          fittedContent,
          viewport,
        })
      ) {
        onPressOutsideContent?.();
      }
    },
    [
      commit,
      fittedContent,
      gesture,
      limits,
      maxScale,
      minScale,
      onPressOutsideContent,
      reset,
      viewport,
    ],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.pinching = false;
          gesture.moved = false;
          gesture.lastPoint = null;
        },
        onPanResponderMove: handlePanMove,
        onPanResponderRelease: handleRelease,
        // A second finger let another responder claim the gesture, so pinch never saw two
        // touches. Keep the gesture until every finger lifts.
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          gesture.pinching = false;
          gesture.lastPoint = null;
        },
      }),
    [gesture, handlePanMove, handleRelease],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
    rootRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  const frameTranslateStyle = useMemo(
    () => ({ transform: [{ translateX }, { translateY }] }),
    [translateX, translateY],
  );
  const contentScaleStyle = useMemo(() => ({ transform: [{ scale }] }), [scale]);

  return (
    <View
      ref={rootRef}
      onLayout={handleLayout}
      style={style ? [styles.root, style] : styles.root}
      testID={testID}
      {...responder.panHandlers}
    >
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityLabel ? "image" : undefined}
        style={styles.canvas}
        testID={testID ? `${testID}-canvas` : undefined}
      >
        {fittedContent ? (
          <Animated.View
            style={[
              styles.contentFrame,
              { width: fittedContent.width, height: fittedContent.height },
              frameTranslateStyle,
            ]}
          >
            <Animated.View style={[styles.content, contentScaleStyle]}>{children}</Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles: Record<string, ViewStyle> = {
  root: { flex: 1, minHeight: 0, overflow: "hidden", position: "relative" },
  canvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  contentFrame: { flexShrink: 0 },
  content: { width: "100%", height: "100%" },
};
