// Port of packages/app/src/components/zoomable-viewport/toolbar.tsx at v0.9.2.
// unistyles -> theme prop, lucide-react-native -> plugin Icon, i18n -> plain English.
import { memo, useCallback, useMemo } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { Theme } from "../../styles/theme.ts";

interface ViewportToolbarProps {
  maxScale: number;
  minScale: number;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  scale: number;
  theme: Theme;
  visible: boolean;
}

interface ToolbarAction {
  disabled: boolean;
  icon: string;
  label: string;
  onPress: () => void;
  testID: string;
}

export const ViewportToolbar = memo(function ViewportToolbar({
  maxScale,
  minScale,
  onReset,
  onZoomIn,
  onZoomOut,
  scale,
  theme,
  visible,
}: ViewportToolbarProps) {
  const toolbarActions: ToolbarAction[] = [
    {
      icon: "ZoomIn",
      label: "Zoom in",
      onPress: onZoomIn,
      testID: "zoomable-viewport-zoom-in",
      disabled: scale >= maxScale,
    },
    {
      icon: "ZoomOut",
      label: "Zoom out",
      onPress: onZoomOut,
      testID: "zoomable-viewport-zoom-out",
      disabled: scale <= minScale,
    },
    {
      icon: "Scan",
      label: "Reset zoom",
      onPress: onReset,
      testID: "zoomable-viewport-reset",
      disabled: scale === 1,
    },
  ];
  const clusterStyle = useMemo(() => createClusterStyle(theme), [theme]);

  return (
    <View style={clusterStyle} testID="zoomable-viewport-toolbar">
      {toolbarActions.map((action) => (
        <ToolbarButton key={action.label} action={action} theme={theme} visible={visible} />
      ))}
    </View>
  );
});

const BUTTON_SIZE = 32;

function ToolbarButton({
  action,
  theme,
  visible,
}: {
  action: ToolbarAction;
  theme: Theme;
  visible: boolean;
}) {
  const buttonStyle = useMemo<ViewStyle>(
    () => ({
      alignItems: "center",
      justifyContent: "center",
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.surface2,
      opacity: visible && !action.disabled ? 1 : 0,
      ...(visible ? {} : { pointerEvents: "none" as const }),
    }),
    [action.disabled, theme.borderRadius.md, theme.colors.surface2, visible],
  );
  const handlePress = useCallback(() => action.onPress(), [action]);

  return (
    <Pressable
      accessibilityLabel={action.label}
      accessibilityRole="button"
      disabled={action.disabled || !visible}
      hitSlop={4}
      onPress={handlePress}
      style={buttonStyle}
      testID={action.testID}
    >
      <Icon name={action.icon} size={16} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function createClusterStyle(theme: Theme): ViewStyle {
  return {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    zIndex: 1,
    flexDirection: "row",
    gap: theme.spacing[1],
  };
}
