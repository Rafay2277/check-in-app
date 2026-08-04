import { FrancoisOne_400Regular } from "@expo-google-fonts/francois-one";
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import {
  PTSerif_400Regular,
  PTSerif_700Bold,
} from "@expo-google-fonts/pt-serif";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "../src/auth";
import { colors } from "../src/theme";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, member } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const onAuth = segments[0] === "(auth)";
    if (!member && !onAuth) {
      router.replace("/(auth)/welcome");
    } else if (member && onAuth) {
      router.replace("/(app)/home");
    }
  }, [ready, member, segments, router]);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentBright} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsReady] = useFonts({
    FrancoisOne_400Regular,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    PTSerif_400Regular,
    PTSerif_700Bold,
  });

  if (!fontsReady) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.accentBright} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg0 },
          }}
        />
      </AuthGate>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg0,
  },
});
