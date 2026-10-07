import { Platform } from "react-native";

// Plugin bundles are compiled by Paseo's neutral plugin compiler, which does
// not resolve .web/.native file variants — platform detection must be runtime.
export const isWeb = Platform.OS === "web";
export const isNative = Platform.OS !== "web";
