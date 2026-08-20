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
        colors={["#161616", colors.bg0, "#0c0c0c"]}
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
