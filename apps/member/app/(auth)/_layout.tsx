import { Stack } from "expo-router";
import { colors, fonts } from "../../src/theme";

export default function AuthLayout() {
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
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "SIGN IN" }} />
      <Stack.Screen name="verify" options={{ title: "VERIFY" }} />
    </Stack>
  );
}
