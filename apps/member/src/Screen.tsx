import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "./theme";

type Props = {
  children: ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({
  children,
  edges = ["top", "bottom"],
  style,
  contentStyle,
}: Props) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={["#191919", "#111111", "#0d0d0d"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(163,158,122,0.18)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.7 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
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
