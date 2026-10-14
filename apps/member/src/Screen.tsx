import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MembershipTier } from "./api";
import { membershipTheme } from "./membershipTheme";
import { colors } from "./theme";

type Props = {
  children: ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /** When set, screen background follows membership tier. */
  membershipTier?: MembershipTier | null;
};

export function Screen({
  children,
  edges = ["top", "bottom"],
  style,
  contentStyle,
  membershipTier,
}: Props) {
  const theme = membershipTheme(membershipTier);
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={theme.screenGradient}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={[styles.safe, contentStyle]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg0,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
  },
});
