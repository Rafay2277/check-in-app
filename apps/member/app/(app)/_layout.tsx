import { Stack } from "expo-router";
import { colors, fonts } from "../../src/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.ink,
        headerTitleStyle: {
          fontFamily: fonts.sansBold,
          fontSize: 13,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg0 },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="confirm" options={{ title: "CHECK IN" }} />
      <Stack.Screen name="qr" options={{ title: "YOUR QR" }} />
    </Stack>
  );
}
