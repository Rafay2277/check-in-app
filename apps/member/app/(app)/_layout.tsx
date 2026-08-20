import { Stack } from "expo-router";
import { colors } from "../../src/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg0 },
        animation: "fade",
      }}
    />
  );
}
